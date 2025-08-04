const sql = require('mssql');
require('dotenv').config();

// DB CONFIG
const config = { 
    server: process.env.DB_HOST, 
    user: process.env.DB_USER, 
    password: process.env.DB_PASSWD, 
    database: process.env.DB,
    port: parseInt(process.env.DB_PORT),
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

// Hardcoded Date Range (for example, from July 1, 2024 to August 19, 2024)
const startDate = '2025-04-15';  // Start Date
const endDate = '2025-04-16';    // End Date




// Get the current date and subtract one day to get the previous day
const currentDate = new Date();
currentDate.setDate(currentDate.getDate() - 1);  // Subtract 1 day to get D-1
const previousDay = currentDate.toISOString().slice(0, 10);  // Format as 'YYYY-MM-DD'

// Use previousDay for both startDate and endDate
// const startDate = previousDay;  // Previous day as start date
// const endDate = previousDay;    // Previous day as end date

console.log(`Start Date: ${startDate}`);
console.log(`End Date: ${endDate}`);

const poolPromise = sql.connect(config);

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
        CAST(I.OCCURDATE AS DATE) AS INCIDENTDATE,
        COUNT(CASE WHEN I.REPORTTYPEID = 1 THEN 1 END) AS INCIDENTINFORMATION,
        COUNT(CASE WHEN I.REPORTTYPEID = 2 THEN 1 END) AS INCIDENTREPORTABLE,
        COUNT(CASE WHEN I.STATUSID = 1 THEN 1 END) AS INCIDENTOPEN,
        COUNT(CASE WHEN I.STATUSID = 2 THEN 1 END) AS INCIDENTCLOSE,
            COUNT(CASE WHEN I.REPORTTYPEID = 1 THEN 1 END) + COUNT(CASE WHEN I.REPORTTYPEID = 2 THEN 1 END) AS INCIDENTCOUNT

    FROM 
        INCIDENTS I
    INNER JOIN SITE S ON S.SIID = I.SIID
    LEFT JOIN VERTICAL V ON S.VID = V.VID
    LEFT JOIN BUSINESS B ON S.BUID = B.BUID
    WHERE 
        I.OCCURDATE BETWEEN @startDate AND @endDate
        AND I.REPORTTYPEID IN (1, 2)
        AND I.STATUSID IN (1, 2)
        AND S.SISTATUS = 'ACTIVE'
    GROUP BY 
        V.VNAME,
        V.VCODE,
        B.BUNAME,
        B.BUCODE,
        S.SIID,
        S.SINAME,
        S.SICODE,
        S.VID,
        S.BUID,
        CAST(I.OCCURDATE AS DATE)
    ORDER BY 
        S.SIID, INCIDENTDATE;
`;

async function processIncidents() {
    const pool = await poolPromise;

    // Fetch incidents from the database
    const result = await pool.request()
        .input('startDate', sql.Date, startDate)
        .input('endDate', sql.Date, endDate)
        .query(qIncident);

    let insertCount = 0;
    let updateCount = 0;

    for (const incidentRow of result.recordset) {
        const siid = incidentRow.SIID;
        const vid = incidentRow.VID;
        const buid = incidentRow.BUID;
        const incidentDate = incidentRow.INCIDENTDATE;
        const month = incidentDate.getMonth() + 1; // Extract month (1-based index)
        const quarter = Math.ceil(month / 3);  // Calculate quarter (1-4)
        const monthName = incidentDate.toLocaleString('default', { month: 'short' }).toUpperCase(); // Jan, Feb, Mar, etc.
        const year = incidentDate.getFullYear(); // Extract year (e.g., 2024)

        // Format the date as YYYY-MM-DD (e.g., '2024-07-01')
        const formattedDate = incidentDate.toISOString().slice(0, 10);  // 'YYYY-MM-DD'

        // Get the next available RowID (Max RowID + 1)
        const maxRowIdResult = await pool.request()
            .query('SELECT MAX(ROWID) AS MAXROWID FROM [dbo].[OL_DASHBOARD_DAILY_INCIDENT]');
        const maxRowId = maxRowIdResult.recordset[0].MAXROWID || 0;  // If no rows exist, start from 0
        const newRowId = maxRowId + 1;  // Increment by 1

        // Check if the record exists
        const checkQuery = `
            SELECT COUNT(*) AS RecordCount
            FROM [dbo].[OL_DASHBOARD_DAILY_INCIDENT]
            WHERE [SIID] = @SIID AND [VID] = @VID AND [BUID] = @BUID AND [DATE] = @DATE
        `;
        const checkResult = await pool.request()
            .input('SIID', sql.Int, siid)
            .input('VID', sql.Int, vid)
            .input('BUID', sql.Int, buid)
            .input('DATE', sql.NVarChar, formattedDate)
            .query(checkQuery);

        const recordExists = checkResult.recordset[0].RecordCount > 0;

        if (recordExists) {
            // Update existing record
            const updateQuery = `
                UPDATE [dbo].[OL_DASHBOARD_DAILY_INCIDENT]
                SET 
                    [INCIDENTOPEN] = @INCIDENTOPEN,
                    [INCIDENTCLOSE] = @INCIDENTCLOSE,
                    [INCIDENTINFORMATION] = @INCIDENTINFORMATION,
                    [INCIDENTREPORTABLE] = @INCIDENTREPORTABLE,
                    [MONTH] = @MONTH,
                    [QUARTER] = @QUARTER,
                    [MONTHNAME] = @MONTHNAME,
                    [YEAR] = @YEAR,
                    [SITECOUNT] = @SITECOUNT,
                    [INCIDENTCOUNT] = @INCIDENTCOUNT
                WHERE 
                    [SIID] = @SIID AND [VID] = @VID AND [BUID] = @BUID AND [DATE] = @DATE
            `;
            await pool.request()
                .input('SIID', sql.Int, siid)
                .input('VID', sql.Int, vid)
                .input('BUID', sql.Int, buid)
                .input('DATE', sql.NVarChar, formattedDate)
                .input('INCIDENTOPEN', sql.Int, incidentRow.INCIDENTOPEN)
                .input('INCIDENTCLOSE', sql.Int, incidentRow.INCIDENTCLOSE)
                .input('INCIDENTINFORMATION', sql.Int, incidentRow.INCIDENTINFORMATION)
                .input('INCIDENTREPORTABLE', sql.Int, incidentRow.INCIDENTREPORTABLE)
                .input('MONTH', sql.Int, month)
                .input('QUARTER', sql.Int, quarter)
                .input('MONTHNAME', sql.NVarChar, monthName)
                .input('YEAR', sql.Int, year)
                .input('SITECOUNT', sql.Int, 1) // Pass SITECOUNT as 1
                .input('INCIDENTCOUNT', sql.Int, incidentRow.INCIDENTCOUNT)  // Pass SITECOUNT as 1
                .query(updateQuery);


            updateCount++;  // Increment update counter
        } else {
            // Insert new record
            const insertQuery = `
                INSERT INTO [dbo].[OL_DASHBOARD_DAILY_INCIDENT]
                ([ROWID], [VNAME], [BUNAME], [SINAME], [VCODE], [BUCODE], [SICODE], [SIID], [VID], [BUID], [DATE], 
                [INCIDENTOPEN], [INCIDENTCLOSE], [INCIDENTINFORMATION], [INCIDENTREPORTABLE], 
                [MONTH], [QUARTER], [MONTHNAME], [YEAR], [SITECOUNT] , [INCIDENTCOUNT])
                VALUES 
                (@ROWID, @VNAME, @BUNAME, @SINAME, @VCODE, @BUCODE, @SICODE, @SIID, @VID, @BUID, @DATE, 
                @INCIDENTOPEN, @INCIDENTCLOSE, @INCIDENTINFORMATION, @INCIDENTREPORTABLE, 
                @MONTH, @QUARTER, @MONTHNAME, @YEAR, @SITECOUNT , @INCIDENTCOUNT);
            `;
            await pool.request()
                .input('ROWID', sql.Int, newRowId)
                .input('VNAME', sql.NVarChar, incidentRow.VNAME)
                .input('BUNAME', sql.NVarChar, incidentRow.BUNAME)
                .input('SINAME', sql.NVarChar, incidentRow.SINAME)
                .input('VCODE', sql.NVarChar, incidentRow.VCODE)
                .input('BUCODE', sql.NVarChar, incidentRow.BUCODE)
                .input('SICODE', sql.NVarChar, incidentRow.SICODE)
                .input('SIID', sql.Int, siid)
                .input('VID', sql.Int, vid)
                .input('BUID', sql.Int, buid)
                .input('DATE', sql.NVarChar, formattedDate)  // Date as formatted string (YYYY-MM-DD)
                .input('INCIDENTOPEN', sql.Int, incidentRow.INCIDENTOPEN)
                .input('INCIDENTCLOSE', sql.Int, incidentRow.INCIDENTCLOSE)
                .input('INCIDENTINFORMATION', sql.Int, incidentRow.INCIDENTINFORMATION)
                .input('INCIDENTREPORTABLE', sql.Int, incidentRow.INCIDENTREPORTABLE)
                .input('MONTH', sql.Int, month)
                .input('QUARTER', sql.Int, quarter)
                .input('MONTHNAME', sql.NVarChar, monthName)
                .input('YEAR', sql.Int, year)
                .input('SITECOUNT', sql.Int, 1)  // Pass SITECOUNT as 1
                .input('INCIDENTCOUNT', sql.Int, incidentRow.INCIDENTCOUNT)  // Pass SITECOUNT as 1
                .query(insertQuery);

            insertCount++;  // Increment insert counter
        }
    }

    console.log(`${insertCount} rows inserted, ${updateCount} rows updated.`);
}

// Run the process
processIncidents().catch((err) => console.log(err));
