const sql = require("mssql");
require('dotenv').config();

// DB CONFIG
// const config = { 
//     server: 'az01ismsproddbds01.database.windows.net', 
//     user: 'sqladminuser', 
//     password: 'pZxxzYRJ#32[', 
//     database: 'az01ismsproddbd01',
//     port: 1433, 
//     options: {
//         encrypt: true, // Use this if you're on Azure
//         trustServerCertificate: true // Change as needed based on your SSL setup
//     }
// };

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
const startDate = '2025-01-01';  // Start Date
const endDate = '2025-04-30';    // End Date

// const startDate = '2025-02-01';  // Start Date
// const endDate = '2025-02-28';    // End Date (2025 is not a leap year)

// const startDate = '2025-03-01';  // Start Date
// const endDate = '2025-03-31';    // End Date

// const startDate = '2025-04-01';  // Start Date
// const endDate = '2025-04-30';    // End Date




// Get the current date and subtract one day to get the previous day
const currentDate = new Date();
currentDate.setDate(currentDate.getDate() - 1);  // Subtract 1 day to get D-1
const previousDay = currentDate.toISOString().slice(0, 10);  // Format as 'YYYY-MM-DD'

// Use previousDay for both startDate and endDate
// const startDate = previousDay;  // Previous day as start date
// const endDate = previousDay;    // Previous day as end date

console.log(`Start Date: ${startDate}`);
console.log(`End Date: ${endDate}`);

// SQL Query for fetching Incident Data, now filtered by startDate and endDate
const qIncident = `
SELECT 
S.VID,
S.BUID,
S.SIID,
S.SINAME,  -- Get SINAME from the SITE table
S.SICODE,
V.VNAME,   -- Get VNAME from the VERTICAL table
V.VCODE,   -- Get VCODE from the VERTICAL table
B.BUNAME,  -- Get BUNAME from the BUSINESS table
B.BUCODE,  -- Get BUCODE from the BUSINESS table
D.DSRDATE,  -- Include DSRDATE as you requested
COUNT(D.DSRSTATUSID) AS TOTAL , -- Total count of DSR entries
COUNT(CASE WHEN D.DSRSTATUS = 'COMPLETED' THEN 1 END) AS COMPLETE,  -- Count of 'COMPLETE' DSR entries
COUNT(CASE WHEN D.DSRSTATUS = 'IN-PROGRESS' THEN 1 END) AS INPROGRESS,  -- Count of 'COMPLETE' DSR entries

COUNT(CASE WHEN D.DSRSTATUS = 'PENDING' THEN 1 END) AS PENDING  -- Count of 'PENDING' DSR entries

FROM 
DSRSTATUS D  -- Data comes from DSRKEYHIGHLIGHTS
LEFT JOIN SITE S ON S.SIID = D.SIID   -- Join SITE on SIID
LEFT JOIN VERTICAL V ON V.VID = S.VID -- Join VERTICAL table on VID
LEFT JOIN BUSINESS B ON B.BUID = S.BUID -- Join BUSINESS table on BUID
WHERE 
D.DSRDATE BETWEEN @startDate AND @endDate  -- Date range filter
AND S.SISTATUS = 'ACTIVE'  -- Only active sites
GROUP BY 
S.VID,
S.BUID,
S.SIID,
S.SINAME,
S.SICODE,
V.VNAME,
V.VCODE,
B.BUNAME,
B.BUCODE,
D.DSRDATE
ORDER BY 
D.DSRDATE, S.SIID;  -- Order by DSRDATE and SIID
`;

// async function insertOrUpdateDashboard(incidentData, date) {
//     let insertCount = 0;  // Counter for INSERT queries
//     let updateCount = 0;  // Counter for UPDATE queries

//     try {
//         const pool = await sql.connect(config);

//         // Log the processing date for each batch
//         console.log(`Processing date: ${date}`);

//         // Loop through each incident record and merge data from all sources
//         for (const incidentRow of incidentData) {
//             const siid = incidentRow.SIID;
//             const vid = incidentRow.VID;
//             const buid = incidentRow.BUID;
//             const DSRDATE = incidentRow.DSRDATE; // This is coming directly from the query
//             console.log(DSRDATE);

//             // Convert DSRDATE to a JavaScript Date if it is a string
//             const formattedDate = new Date(DSRDATE);

//             // Extract month, year, quarter, and month name from DSRDATE
//             const month = formattedDate.getMonth() + 1;  // JavaScript months are 0-indexed
//             const year = formattedDate.getFullYear();
//             const monthName = formattedDate.toLocaleString('en-US', { month: 'short' }).toUpperCase();
//             const quarter = Math.floor((month - 1) / 3) + 1;

//             // Fetch the current max ROWID for each iteration and increment it by 1
//             const maxRowIdQuery = `SELECT MAX(ROWID) AS MaxRowID FROM [dbo].[OL_DASHBOARD_DAILY_DSRSTATUS1]`;
//             const maxRowIdResult = await pool.request().query(maxRowIdQuery);
//             const maxRowId = maxRowIdResult.recordset[0].MaxRowID || 0;  // If no rows, set ROWID to 0
//             const newRowId = maxRowId + 1; // Increment ROWID by 1 for each iteration

//             // Check if the record exists in OL_DASHBOARD_DAILY
//             const checkQuery = `SELECT COUNT(*) AS RecordCount
//                                 FROM [dbo].[OL_DASHBOARD_DAILY_DSRSTATUS1]
//                                 WHERE [SIID] = @SIID AND [VID] = @VID AND [BUID] = @BUID AND [DATE] = @DATE`;
//             const checkResult = await pool.request()
//                 .input('SIID', sql.Int, siid)
//                 .input('VID', sql.Int, vid)
//                 .input('BUID', sql.Int, buid)
//                 .input('DATE', sql.Date, DSRDATE)
//                 .query(checkQuery);

//             const recordExists = checkResult.recordset[0].RecordCount > 0;

//             if (recordExists) {
//                 // Update existing record
//                 const updateQuery = `
//                     UPDATE [dbo].[OL_DASHBOARD_DAILY_DSRSTATUS1]
//                     SET 
//                         [TOTAL] = @TOTAL,
//                         [COMPLETE] = @COMPLETE,
//                         [INPROGRESS] = @INPROGRESS,
//                         [PENDING] = @PENDING,
//                         [MONTH] = @MONTH,
//                         [QUARTER] = @QUARTER,
//                         [MONTHNAME] = @MONTHNAME,
//                         [YEAR] = @YEAR
//                     WHERE 
//                         [SIID] = @SIID AND [VID] = @VID AND [BUID] = @BUID AND [DATE] = @DATE
//                 `;
//                 await pool.request()
//                     .input('SIID', sql.Int, siid)
//                     .input('VID', sql.Int, vid)
//                     .input('BUID', sql.Int, buid)
//                     .input('DATE', sql.Date, DSRDATE)
//                     .input('TOTAL', sql.Int, incidentRow.TOTAL)
//                     .input('COMPLETE', sql.Int, incidentRow.COMPLETE)
//                     .input('INPROGRESS', sql.Int, incidentRow.INPROGRESS)
//                     .input('PENDING', sql.Int, incidentRow.PENDING)
//                     .input('MONTH', sql.Int, month)
//                     .input('QUARTER', sql.Int, quarter)
//                     .input('MONTHNAME', sql.NVarChar, monthName)
//                     .input('YEAR' , sql.Int , year)

//                     .query(updateQuery);

//                 updateCount++;  // Increment update counter
//             } else {
//                 // Insert new record
//                 const insertQuery = `
//                     INSERT INTO [dbo].[OL_DASHBOARD_DAILY_DSRSTATUS1]
//                     ([ROWID],  [VID], [BUID], [SIID],[VNAME], [BUNAME], [SINAME], [VCODE], [BUCODE], [SICODE], [DATE], 
//                      [TOTAL], [COMPLETE], [INPROGRESS], [PENDING], 
//                     [MONTH], [QUARTER], [MONTHNAME] , [YEAR])
//                     VALUES 
//                     (@ROWID, @VID , @BUID , @SIID , @VNAME, @BUNAME, @SINAME, @VCODE, @BUCODE, @SICODE, @DATE, 
//                      @TOTAL,@COMPLETE,@INPROGRESS,@PENDING, 
//                     @MONTH, @QUARTER, @MONTHNAME , @YEAR);
//                 `;
//                 await pool.request()
//                     .input('ROWID', sql.Int, newRowId)
//                     .input('SIID', sql.Int, siid)
//                     .input('VID', sql.Int, vid)
//                     .input('BUID', sql.Int, buid)
//                     .input('VNAME', sql.NVarChar, incidentRow.VNAME)
//                     .input('BUNAME', sql.NVarChar, incidentRow.BUNAME)
//                     .input('SINAME', sql.NVarChar, incidentRow.SINAME)
//                     .input('VCODE', sql.NVarChar, incidentRow.VCODE)
//                     .input('BUCODE', sql.NVarChar, incidentRow.BUCODE)
//                     .input('SICODE', sql.NVarChar, incidentRow.SICODE)
//                     .input('DATE', sql.Date, DSRDATE)
//                     .input('TOTAL', sql.Int, incidentRow.TOTAL)
//                     .input('COMPLETE', sql.Int, incidentRow.COMPLETE)
//                     .input('INPROGRESS', sql.Int, incidentRow.INPROGRESS)
//                     .input('PENDING', sql.Int, incidentRow.PENDING)
//                     .input('MONTH', sql.Int, month)
//                     .input('QUARTER', sql.Int, quarter)
//                     .input('MONTHNAME', sql.NVarChar, monthName)
//                     .input('YEAR' , sql.Int , year)
                    
//                     await pool.query(insertQuery)

//                     // console.log(insertQuery);
                    
//                 insertCount++;  // Increment insert counter
//             }
//         }

//         console.log(`Total INSERT queries executed: ${insertCount}`);
//         console.log(`Total UPDATE queries executed: ${updateCount}`);
//     } catch (err) {
//         console.error('Error in insertOrUpdateDashboard:', err.message);
//     }
// }
async function insertOrUpdateDashboard(incidentData, date) {
    let insertCount = 0;  // Counter for INSERT queries
    let updateCount = 0;  // Counter for UPDATE queries

    try {
        const pool = await sql.connect(config);

        // Log the processing date for each batch
        console.log(`Processing date: ${date}`);

        // Loop through each incident record and merge data from all sources
        for (const incidentRow of incidentData) {
            const siid = incidentRow.SIID;
            const vid = incidentRow.VID;
            const buid = incidentRow.BUID;
            const DSRDATE = incidentRow.DSRDATE; // This is coming directly from the query
            console.log(DSRDATE);

            // Convert DSRDATE to a JavaScript Date if it is a string
            const formattedDate = new Date(DSRDATE);

            // Extract month, year, quarter, and month name from DSRDATE
            const month = formattedDate.getMonth() + 1;  // JavaScript months are 0-indexed
            const year = formattedDate.getFullYear();
            const monthName = formattedDate.toLocaleString('en-US', { month: 'short' }).toUpperCase();
            const quarter = Math.floor((month - 1) / 3) + 1;

            // Fetch the current max ROWID for each iteration and increment it by 1
            const maxRowIdQuery = `SELECT MAX(ROWID) AS MaxRowID FROM [dbo].[OL_DASHBOARD_DAILY_DSRSTATUS]`;
            const maxRowIdResult = await pool.request().query(maxRowIdQuery);
            const maxRowId = maxRowIdResult.recordset[0].MaxRowID || 0;  // If no rows, set ROWID to 0
            const newRowId = maxRowId + 1; // Increment ROWID by 1 for each iteration

            // Check if the record exists in OL_DASHBOARD_DAILY
            const checkQuery = `SELECT COUNT(*) AS RecordCount
                                FROM [dbo].[OL_DASHBOARD_DAILY_DSRSTATUS]
                                WHERE [SIID] = @SIID AND [VID] = @VID AND [BUID] = @BUID AND [DSRDATE] = @DATE`;
            const checkResult = await pool.request()
                .input('SIID', sql.Int, siid)
                .input('VID', sql.Int, vid)
                .input('BUID', sql.Int, buid)
                .input('DATE', sql.Date, DSRDATE)
                .query(checkQuery);

            const recordExists = checkResult.recordset[0].RecordCount > 0;

            if (recordExists) {
                // Update existing record
                const updateQuery = `
                    UPDATE [dbo].[OL_DASHBOARD_DAILY_DSRSTATUS]
                    SET 
                        [TOTAL] = @TOTAL,
                        [COMPLETE] = @COMPLETE,
                        [INPROGRESS] = @INPROGRESS,
                        [PENDING] = @PENDING,
                        [MONTH] = @MONTH,
                        [QUARTER] = @QUARTER,
                        [MONTHNAME] = @MONTHNAME,
                        [YEAR] = @YEAR
                    WHERE 
                        [SIID] = @SIID AND [VID] = @VID AND [BUID] = @BUID AND [DSRDATE] = @DATE
                `;
                await pool.request()
                    .input('SIID', sql.Int, siid)
                    .input('VID', sql.Int, vid)
                    .input('BUID', sql.Int, buid)
                    .input('DATE', sql.Date, DSRDATE)
                    .input('TOTAL', sql.Int, incidentRow.TOTAL)
                    .input('COMPLETE', sql.Int, incidentRow.COMPLETE)
                    .input('INPROGRESS', sql.Int, incidentRow.INPROGRESS)
                    .input('PENDING', sql.Int, incidentRow.PENDING)
                    .input('MONTH', sql.Int, month)
                    .input('QUARTER', sql.Int, quarter)
                    .input('MONTHNAME', sql.NVarChar, monthName)
                    .input('YEAR' , sql.Int , year)
                    .query(updateQuery);

                updateCount++;  // Increment update counter
            } else {
                // Insert new record
                const insertQuery = `
                    INSERT INTO [dbo].[OL_DASHBOARD_DAILY_DSRSTATUS]
                    ([ROWID],  [VID], [BUID], [SIID],[VNAME], [BUNAME], [SINAME], [VCODE], [BUCODE], [SICODE], [DSRDATE], 
                     [TOTAL], [COMPLETE], [INPROGRESS], [PENDING], 
                    [MONTH], [QUARTER], [MONTHNAME] , [YEAR])
                    VALUES 
                    (@ROWID, @VID , @BUID , @SIID , @VNAME, @BUNAME, @SINAME, @VCODE, @BUCODE, @SICODE, @DATE, 
                     @TOTAL,@COMPLETE,@INPROGRESS,@PENDING, 
                    @MONTH, @QUARTER, @MONTHNAME , @YEAR);
                `;
                await pool.request()
                    .input('ROWID', sql.Int, newRowId) // Declare ROWID parameter
                    .input('SIID', sql.Int, siid)
                    .input('VID', sql.Int, vid)
                    .input('BUID', sql.Int, buid)
                    .input('VNAME', sql.NVarChar, incidentRow.VNAME)
                    .input('BUNAME', sql.NVarChar, incidentRow.BUNAME)
                    .input('SINAME', sql.NVarChar, incidentRow.SINAME)
                    .input('VCODE', sql.NVarChar, incidentRow.VCODE)
                    .input('BUCODE', sql.NVarChar, incidentRow.BUCODE)
                    .input('SICODE', sql.NVarChar, incidentRow.SICODE)
                    .input('DATE', sql.Date, DSRDATE)
                    .input('TOTAL', sql.Int, incidentRow.TOTAL)
                    .input('COMPLETE', sql.Int, incidentRow.COMPLETE)
                    .input('INPROGRESS', sql.Int, incidentRow.INPROGRESS)
                    .input('PENDING', sql.Int, incidentRow.PENDING)
                    .input('MONTH', sql.Int, month)
                    .input('QUARTER', sql.Int, quarter)
                    .input('MONTHNAME', sql.NVarChar, monthName)
                    .input('YEAR', sql.Int, year)
                    .query(insertQuery);

                insertCount++;  // Increment insert counter
            }
        }

        console.log(`Total INSERT queries executed: ${insertCount}`);
        console.log(`Total UPDATE queries executed: ${updateCount}`);
    } catch (err) {
        console.error('Error in insertOrUpdateDashboard:', err.message);
    }
}

async function fetchAndInsertIncidentData() {
    try {
        const pool = await sql.connect(config);

        // Fetch Incident Data for the given date range
        const incidentResult = await pool.request()
            .input('startDate', sql.Date, startDate)
            .input('endDate', sql.Date, endDate)
            .query(qIncident);

        // For each date, pass the rows to insertOrUpdateDashboard
        const groupedData = incidentResult.recordset.reduce((acc, row) => {
            const DSRDATE = row.DSRDATE;
            if (!acc[DSRDATE]) {
                acc[DSRDATE] = [];
            }
            acc[DSRDATE].push(row);
            return acc;
        }, {});

        // Process each date
        for (const date in groupedData) {
            await insertOrUpdateDashboard(groupedData[date], date);
        }

        pool.close();
    } catch (err) {
        console.error("Error in fetching or inserting data:", err);
    }
}

// Execute the process
fetchAndInsertIncidentData();
