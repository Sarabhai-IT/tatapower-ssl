const sql = require("mssql");
// const cron = require('node-cron');

// DB CONFIG
// DB CONFIG 
const config = { 
    server: 'az01ismsproddbds01.database.windows.net', 
    user: 'sqladminuser', 
    password: 'pZxxzYRJ#32[', 
    database: 'az01ismsproddbd01',
    port: 1433, 
    options: {
        encrypt: true, // Use this if you're on Azure
        trustServerCertificate: false // Change as needed based on your SSL setup
    }
}; 
// Hardcoded Start and End Date (for example, August 2024)
const startDate = '2024-09-01';  // Start Date
const endDate = '2024-09-30';    // End Date

// SQL Query for fetching Incident Data
const qIncident = `
    SELECT
    V.VNAME,
    V.VCODE,
    B.BUNAME,
    B.BUCODE,
    S.SIID,
    S.SINAME,
    S.SICODE,
    S.VID,
    S.BUID,
    COUNT(CASE WHEN I.REPORTTYPEID = 1 THEN 1 END) AS INCIDENTINFORMATION,
    COUNT(CASE WHEN I.REPORTTYPEID = 2 THEN 1 END) AS INCIDENTREPORTABLE,
    COUNT(CASE WHEN I.STATUSID = 1 THEN 1 END) AS INCIDENTOPEN,
    COUNT(CASE WHEN I.STATUSID = 2 THEN 1 END) AS INCIDENTCLOSE
FROM 
    SITE S
LEFT JOIN VERTICAL V ON S.VID = V.VID
LEFT JOIN BUSINESS B ON S.BUID = B.BUID
LEFT JOIN INCIDENTS I ON S.SIID = I.SIID
    AND I.REPORTTYPEID IN (1, 2)
    AND I.STATUSID IN (1, 2)
    AND I.OCCURDATE BETWEEN @StartDate AND @EndDate
WHERE S.SISTATUS = 'ACTIVE'  -- Filtering for active sites
GROUP BY 
    S.SIID,
    S.SINAME,
    S.SICODE,
    V.VNAME,
    V.VCODE,
    B.BUNAME,
    B.BUCODE,
    S.VID,
    S.BUID
`;


const keyHighlightsCCTVSum = `
SELECT 
    D.SIID,
    S.VID,
    S.BUID,
    S.SINAME,
    S.SICODE,

    -- Avoid division by zero with CASE statement
    CAST(SUM(CAST(ISNULL(D.CCTV, 0) AS INT)) AS INT) / 
    CASE 
        WHEN (SELECT COUNT(*) 
              FROM DSRKEYHIGHLIGHTS D1 
              WHERE D1.SIID = D.SIID 
              AND D1.DSRDATE BETWEEN CAST(@StartDate AS DATE) AND CAST(@EndDate  AS DATE)
             ) > 0 
        THEN (SELECT COUNT(*) 
              FROM DSRKEYHIGHLIGHTS D1 
              WHERE D1.SIID = D.SIID 
              AND D1.DSRDATE BETWEEN CAST(@StartDate AS DATE) AND CAST(@EndDate AS DATE)
             )
        ELSE 1  -- Prevent division by zero by using 1 when there are no rows
    END AS CCTV_SUM
FROM 
    DSRKEYHIGHLIGHTS D
LEFT JOIN SITE S ON D.SIID = S.SIID
    AND S.SISTATUS = 'ACTIVE'  -- Filtering for active sites
WHERE 
    D.DSRDATE BETWEEN CAST(@StartDate AS DATE) AND CAST(@EndDate AS DATE)
GROUP BY 
    D.SIID,
    S.VID,
    S.BUID,
    S.SINAME,
    S.SICODE
HAVING 
    CAST(SUM(CAST(ISNULL(D.CCTV, 0) AS INT)) AS INT) / 
    CASE 
        WHEN (SELECT COUNT(*) 
              FROM DSRKEYHIGHLIGHTS D1 
              WHERE D1.SIID = D.SIID 
              AND D1.DSRDATE BETWEEN CAST(@StartDate AS DATE) AND CAST(@EndDate DATE)
             ) > 0 
        THEN (SELECT COUNT(*) 
              FROM DSRKEYHIGHLIGHTS D1 
              WHERE D1.SIID = D.SIID 
              AND D1.DSRDATE BETWEEN CAST(@StartDate AS DATE) AND CAST(@EndDate AS DATE)
             )
        ELSE 1  
    END > 0; 
`;

console.log(keyHighlightsCCTVSum);

// Function to fetch monthly data and insert into OL_DASHBOARD_MONTHLY_DSR
async function getMonthlyData(startDate, endDate) {
    try {
        // Connect to the database
        const pool = await sql.connect(config);

        // Fetch all the data
        const incidentResult = await pool.request()
            .input('StartDate', sql.Date, startDate)
            .input('EndDate', sql.Date, endDate)
            .query(qIncident);

       
        const keyHighlightsCCTVSumResult = await pool.request()
            .input('StartDate', sql.Date, startDate)
            .input('EndDate', sql.Date, endDate)
            .query(keyHighlightsCCTVSum);

      
        // Merge and insert/update the data
        await insertOrUpdateDashboard(incidentResult.recordset, keyHighlightsCCTVSumResult.recordset ,startDate);

        pool.close();
    } catch (err) {
        console.error("Error in fetching or inserting data:", err);
    }
}




// Function to insert or update data in OL_DASHBOARD_MONTHLY_DSR table

async function insertOrUpdateDashboard(incidentData,  keyHighlightsCCTVSumResult,startDate) {
    console.log(acsResult,"acsresult");
    let insertCount = 0;  // Counter for INSERT queries
    let updateCount = 0;  // Counter for UPDATE queries

    try { 
        const pool = await sql.connect(config);
        const date = new Date(startDate);
        const month = date.getMonth() + 1; // Months are 0-indexed in JavaScript
        const year = date.getFullYear();

        let financialYear = year;
        let financialQuarter = '';
        if (month >= 4 && month <= 6) {
            financialQuarter = 'Q1';
        } else if (month >= 7 && month <= 9) {
            financialQuarter = 'Q2';
        } else if (month >= 10 && month <= 12) {
            financialQuarter = 'Q3';
        } else {
            financialQuarter = 'Q4';
            financialYear -= 1;
        }

        const monthName = date.toLocaleString('en-US', { month: 'short' }).toUpperCase();  // Uppercase month name

        // Loop through each incident record and merge data from all sources
        for (const incidentRow of incidentData) {
            const siid = incidentRow.SIID;
            const vid = incidentRow.VID;
            const buid = incidentRow.BUID;

            // Fetch the current max ROWID for each iteration and increment it by 1
            const maxRowIdQuery = `
                SELECT MAX(ROWID) AS MaxRowID
                FROM [az01ismsproddbd01].[dbo].[OL_DASHBOARD_MONTHLY_DSR]
            `;
            const maxRowIdResult = await pool.request().query(maxRowIdQuery);
            const maxRowId = maxRowIdResult.recordset[0].MaxRowID || 0;  // If no rows, set ROWID to 0
            const newRowId = maxRowId + 1; // Increment ROWID by 1 for each iteration

            // Check for undefined or null data arrays and handle them
            const keyCCTVSum = keyHighlightsCCTVSumResult ? keyHighlightsCCTVSumResult.CCTV_SUM : 0;
   
            // Check if the record exists in OL_DASHBOARD_MONTHLY_DSR
            const checkQuery = `
                SELECT COUNT(*) AS RecordCount
                FROM [az01ismsproddbd01].[dbo].[OL_DASHBOARD_MONTHLY_DSR]
                WHERE [SIID] = @SIID
                  AND [VID] = @VID
                  AND [BUID] = @BUID
                  AND [MONTH] = @MONTH
                  AND [YEAR] = @YEAR 
                  AND [VNAME] = @VNAME
                  AND [BUNAME] = @BUNAME
            `;

            const checkResult = await pool.request()
                .input('SIID', sql.Int, siid)
                .input('VID', sql.Int, vid)
                .input('BUID', sql.Int, buid)
                .input('MONTH', sql.Int, month)
                .input('YEAR', sql.Int, year)
                .input('VNAME', sql.NVarChar, incidentRow.VNAME)
                .input('BUNAME', sql.NVarChar, incidentRow.BUNAME)
                .query(checkQuery);

            const recordExists = checkResult.recordset[0].RecordCount > 0;

            if (recordExists) {
                // Update existing record
                const updateQuery = `
                    UPDATE [az01ismsproddbd01].[dbo].[OL_DASHBOARD_MONTHLY_DSR]
                    SET 
                        [INCIDENTOPEN] = @INCIDENTOPEN,
                        [INCIDENTCLOSE] = @INCIDENTCLOSE,
                        [INCIDENTINFORMATION] = @INCIDENTINFORMATION,
                        [INCIDENTREPORTABLE] = @INCIDENTREPORTABLE,
                        [CCTV] = @CCTV
                        
                    WHERE 
                        [SIID] = @SIID AND [VID] = @VID AND [BUID] = @BUID
                        AND [YEAR] = @YEAR AND [MONTH] = @MONTH
                        AND [VNAME] = @VNAME AND [BUNAME] = @BUNAME
                `;
                await pool.request()
                    .input('SIID', sql.Int, siid)
                    .input('VID', sql.Int, vid)
                    .input('BUID', sql.Int, buid)
                    .input('MONTH', sql.Int, month)
                    .input('YEAR', sql.Int, year)
                    .input('VNAME', sql.NVarChar, incidentRow.VNAME)
                    .input('BUNAME', sql.NVarChar, incidentRow.BUNAME)
                    .input('INCIDENTOPEN', sql.Int, incidentRow.INCIDENTOPEN)
                    .input('INCIDENTCLOSE', sql.Int, incidentRow.INCIDENTCLOSE)
                    .input('INCIDENTINFORMATION', sql.Int, incidentRow.INCIDENTINFORMATION)
                    .input('INCIDENTREPORTABLE', sql.Int, incidentRow.INCIDENTREPORTABLE)
                    .input('CCTV', sql.Int, keyCCTVSum)
                    .query(updateQuery);

                updateCount++;  // Increment update counter
            } else {
                  // Insert new record
                  const insertQuery = `
                  INSERT INTO [az01ismsproddbd01].[dbo].[OL_DASHBOARD_MONTHLY_DSR]
                  ([ROWID], [VNAME], [BUNAME], [SINAME], [VCODE], [BUCODE], [SICODE], [YEAR], [MONTH], [QUARTER], [MONTHNAME], 
                   [INCIDENTOPEN], [INCIDENTCLOSE], [INCIDENTINFORMATION], [INCIDENTREPORTABLE],
                    [CCTV])
                  VALUES 
                  (@ROWID, @VNAME, @BUNAME, @SINAME, @VCODE, @BUCODE, @SICODE, 
                   @YEAR, @MONTH, @QUARTER, @MONTHNAME, 
                   @INCIDENTOPEN, @INCIDENTCLOSE, @INCIDENTINFORMATION, @INCIDENTREPORTABLE, 
                   @CCTV);
              `;

              await pool.request()
                  .input('ROWID', sql.Int, newRowId)
                  .input('VNAME', sql.NVarChar, incidentRow.VNAME)
                  .input('BUNAME', sql.NVarChar, incidentRow.BUNAME)
                  .input('SINAME', sql.NVarChar, incidentRow.SINAME)
                  .input('VCODE', sql.NVarChar, incidentRow.VCODE)
                  .input('BUCODE', sql.NVarChar, incidentRow.BUCODE)
                  .input('SICODE', sql.NVarChar, incidentRow.SICODE)
                  .input('YEAR', sql.Int, year)
                  .input('MONTH', sql.Int, month)
                  .input('QUARTER', sql.NVarChar, financialQuarter)
                  .input('MONTHNAME', sql.NVarChar, monthName)
                  .input('INCIDENTOPEN', sql.Int, incidentRow.INCIDENTOPEN)
                  .input('INCIDENTCLOSE', sql.Int, incidentRow.INCIDENTCLOSE)
                  .input('INCIDENTINFORMATION', sql.Int, incidentRow.INCIDENTINFORMATION)
                  .input('INCIDENTREPORTABLE', sql.Int, incidentRow.INCIDENTREPORTABLE)
                  .input('CCTV', sql.Int, keyCCTVSum)
                .query(insertQuery);
                // Insert new record (INSERT query logic here)
                // Similar to the update query, just with an INSERT INTO statement instead of UPDATE
                insertCount++;  // Increment insert counter
            }
        }

        console.log(`Total INSERT queries executed: ${insertCount}`);
        console.log(`Total UPDATE queries executed: ${updateCount}`);
    } catch (err) {
        console.error('Error in insertOrUpdateDashboard:', err.message);
    }
}










// Run the function
getMonthlyData(startDate, endDate);

// // You can also use node-cron to schedule this task at regular intervals (e.g., every day at midnight)
// cron.schedule('0 0 * * *', () => {
//     const today = new Date();
//     const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
//     const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
//     getMonthlyData(startOfMonth.toISOString().split('T')[0], endOfMonth.toISOString().split('T')[0]);
// });
   
