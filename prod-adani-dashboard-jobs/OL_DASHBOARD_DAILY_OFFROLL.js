const sql = require("mssql");
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
        trustServerCertificate: false
    }
};

// Hardcoded Date Range (for example, from July 1, 2024 to August 19, 2024)
// const startDate = '2023-04-01';  // Start Date
// const endDate = '2023-06-30';    // End Date

// const startDate = '2023-07-01';  // Start Date
// const endDate = '2023-09-30';    // End Date

// const startDate = '2023-10-01';  // Start Date
// const endDate = '2023-12-31';    // End Date

// const startDate = '2024-01-01';  // Start Date
// const endDate = '2024-03-31';    // End Date

// const startDate = '2024-04-01';  // Start Date
// const endDate = '2024-06-30';    // End Date

// const startDate = '2024-07-01';  // Start Date
// const endDate = '2024-09-30';    // End Date

// const startDate = '2024-10-01';  // Start Date
// const endDate = '2024-12-31';    // End Date

// const startDate = '2025-01-01';  // Start Date
// const endDate = '2025-03-31';    // End Date

const startDate = '2025-04-01';  // Start Date
const endDate = '2025-04-30';    // End Date


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
    D.DSRDATE,  -- Get DSRDATE for each date within the range
    
    -- Sum of AVAILABLE for each row, handle NULL values
    SUM(ISNULL(D.AVAILABLE, 0)) AS AVAILABLE
FROM 
    DSRAGENCYSECSTAFF D  -- Data comes from DSRAGENCYSECSTAFF
LEFT JOIN SITE S ON S.SIID = D.SIID   -- Join SITE on SIID
LEFT JOIN VERTICAL V ON V.VID = S.VID -- Join VERTICAL table on VID
LEFT JOIN BUSINESS B ON B.BUID = S.BUID -- Join BUSINESS table on BUID
WHERE 
    D.DSRDATE BETWEEN @startDate AND @endDate  -- Date range filter
    AND S.SISTATUS = 'ACTIVE'  -- Only active sites
	AND D.DSRPARAMSNAME NOT IN ('DEV DOG SECURITY' , 'NETAMBIT' , 'PSA' , 'CSPL SBU' , 'SECURE 1' , 'ASG' , 'Lumiere' ,
    'ISSSDB' , 'ARNI ENGINEERING' , 'Champion Pushpak' , 'KRYSTAL' , 'QUESS' , 'INVICTUS' , 'ARPL' , 'INNOV' , 'RANDSTAND' ,
    'CRISTAL' , 'LSS' , 'SHIV ENGINEERING' , 'MANPOWER' , 'CSPL')
    AND ISNULL(D.AVAILABLE, 0) != 0  -- Exclude rows where AVAILABLE is 0 or NULL
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
    D.DSRDATE  -- Group by DSRDATE to sum for each site per date
ORDER BY 
    D.DSRDATE, S.SIID;  -- Order by DSRDATE and SIID
`;

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
            const maxRowIdQuery = `SELECT MAX(ROWID) AS MaxRowID FROM [dbo].[OL_DASHBOARD_DAILY_OFFROLL]`;
            const maxRowIdResult = await pool.request().query(maxRowIdQuery);
            const maxRowId = maxRowIdResult.recordset[0].MaxRowID || 0;  // If no rows, set ROWID to 0
            const newRowId = maxRowId + 1; // Increment ROWID by 1 for each iteration

            // Check if the record exists in OL_DASHBOARD_DAILY
            const checkQuery = `SELECT COUNT(*) AS RecordCount
                                FROM [dbo].[OL_DASHBOARD_DAILY_OFFROLL]
                                WHERE [SIID] = @SIID AND [VID] = @VID AND [BUID] = @BUID AND [DATE] = @DATE`;
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
                    UPDATE [dbo].[OL_DASHBOARD_DAILY_OFFROLL]
                    SET 
                        [AVAILABLE] = @AVAILABLE,
                        [MONTH] = @MONTH,
                        [QUARTER] = @QUARTER,
                        [MONTHNAME] = @MONTHNAME,
                        [YEAR] = @YEAR
                    WHERE 
                        [SIID] = @SIID AND [VID] = @VID AND [BUID] = @BUID AND [DATE] = @DATE
                `;
                await pool.request()
                    .input('SIID', sql.Int, siid)
                    .input('VID', sql.Int, vid)
                    .input('BUID', sql.Int, buid)
                    .input('DATE', sql.Date, DSRDATE)
                    .input('AVAILABLE', sql.Int, incidentRow.AVAILABLE)
                    .input('MONTH', sql.Int, month)
                    .input('QUARTER', sql.Int, quarter)
                    .input('MONTHNAME', sql.NVarChar, monthName)
                    .input('YEAR' , sql.Int , year)

                    .query(updateQuery);

                updateCount++;  // Increment update counter
            } else {
                // Insert new record
                const insertQuery = `
                    INSERT INTO [dbo].[OL_DASHBOARD_DAILY_OFFROLL]
                    ([ROWID],  [VID], [BUID], [SIID],[VNAME], [BUNAME], [SINAME], [VCODE], [BUCODE], [SICODE], [DATE], 
                     [AVAILABLE], 
                    [MONTH], [QUARTER], [MONTHNAME] , [YEAR])
                    VALUES 
                    (@ROWID, @VID , @BUID , @SIID , @VNAME, @BUNAME, @SINAME, @VCODE, @BUCODE, @SICODE, @DATE, 
                     @AVAILABLE, 
                    @MONTH, @QUARTER, @MONTHNAME , @YEAR);
                `;
                await pool.request()
                    .input('ROWID', sql.Int, newRowId)
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
                    .input('AVAILABLE', sql.Int, incidentRow.AVAILABLE)
                    .input('MONTH', sql.Int, month)
                    .input('QUARTER', sql.Int, quarter)
                    .input('MONTHNAME', sql.NVarChar, monthName)
                    .input('YEAR' , sql.Int , year)
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
