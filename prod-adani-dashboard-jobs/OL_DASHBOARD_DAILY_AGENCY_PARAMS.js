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
// const startDate = '2024-12-16';  // Start Date
// const endDate = '2025-01-31';    // End Date

// Get the current date and subtract one day to get the previous day
const currentDate = new Date();
currentDate.setDate(currentDate.getDate() - 1);  // Subtract 1 day to get D-1
const previousDay = currentDate.toISOString().slice(0, 10);  // Format as 'YYYY-MM-DD'

// Use previousDay for both startDate and endDate
const startDate = previousDay;  // Previous day as start date
const endDate = previousDay;    // Previous day as end date

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

    -- Sum the AUTHORIZED values, exclude rows where AUTHORIZED is 0 or NULL
    SUM(CASE WHEN D.AVAILABLE IS NOT NULL AND D.AVAILABLE != 0 THEN D.AVAILABLE ELSE 0 END) AS AVAILABLE,
    
    -- Sum the AVAILABLE values, replacing NULLs with 0
    SUM(ISNULL(D.AUTHORIZED, 0)) AS AUTHORIZED,
    
    -- Sum the DEFICIENCY values, replacing NULLs with 0
    SUM(ISNULL(D.DEFICIENCY, 0)) AS DEFICIENCY,

    -- Add DSRPARAMSNAME if it exists in the DSRSECAUTO table
    D.DSRPARAMSNAME  -- Add this field from the DSRSECAUTO table (assuming it exists)

FROM 
    DSRAGENCYSECSTAFF D  -- Data comes from DSRSECAUTO
LEFT JOIN SITE S ON S.SIID = D.SIID   -- Join SITE on SIID
LEFT JOIN VERTICAL V ON V.VID = S.VID -- Join VERTICAL table on VID
LEFT JOIN BUSINESS B ON B.BUID = S.BUID -- Join BUSINESS table on BUID

WHERE 
    D.DSRDATE BETWEEN @startDate AND @endDate  -- Date range filter (single date in this case)
    AND S.SISTATUS = 'ACTIVE'  -- Only active sites
    -- The condition for AUTHORIZED: exclude rows where AUTHORIZED is 0 or NULL
    AND (D.AVAILABLE IS NOT NULL AND D.AVAILABLE != 0)

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
    D.DSRDATE,
    D.DSRPARAMSNAME  -- Group by DSRPARAMSNAME along with other fields

ORDER BY 
    D.DSRDATE, S.SIID;  -- Order by DSRDATE and SIID

`;

async function insertOrUpdateDashboard(incidentData, date) {
    let insertCount = 0;  // Counter for INSERT queries

    try {
        const pool = await sql.connect(config);

        // Log the processing date for each batch
        console.log(`Processing date: ${date}`);

        // Loop through each incident record and insert data
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
            const maxRowIdQuery = `SELECT MAX(ROWID) AS MaxRowID FROM [dbo].[OL_DASHBOARD_DAILY_AGENCY_PARAMS]`;
            const maxRowIdResult = await pool.request().query(maxRowIdQuery);
            const maxRowId = maxRowIdResult.recordset[0].MaxRowID || 0;  // If no rows, set ROWID to 0
            const newRowId = maxRowId + 1; // Increment ROWID by 1 for each iteration

            // Insert new record (no check for existing record)
            const insertQuery = `
                INSERT INTO [dbo].[OL_DASHBOARD_DAILY_AGENCY_PARAMS]
                ([ROWID], [VID], [BUID], [SIID], [VNAME], [BUNAME], [SINAME], [VCODE], [BUCODE], [SICODE], [DATE], 
                 [AVAILABLE], [AUTHORIZED], [DEFICIENCY], [MONTH], [QUARTER], [MONTHNAME], [YEAR], [DSRPARAMSNAME])
                VALUES 
                (@ROWID, @VID, @BUID, @SIID, @VNAME, @BUNAME, @SINAME, @VCODE, @BUCODE, @SICODE, @DATE, 
                 @AVAILABLE, @AUTHORIZED, @DEFICIENCY, @MONTH, @QUARTER, @MONTHNAME, @YEAR, @DSRPARAMSNAME);
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
                .input('AUTHORIZED', sql.Int, incidentRow.AUTHORIZED)
                .input('DEFICIENCY', sql.Int, incidentRow.DEFICIENCY)
                .input('MONTH', sql.Int, month)
                .input('QUARTER', sql.Int, quarter)
                .input('MONTHNAME', sql.NVarChar, monthName)
                .input('YEAR', sql.Int, year)
                .input('DSRPARAMSNAME', sql.NVarChar, incidentRow.DSRPARAMSNAME)
                .query(insertQuery);

            insertCount++;  // Increment insert counter
        }

        console.log(`Total INSERT queries executed: ${insertCount}`);
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

