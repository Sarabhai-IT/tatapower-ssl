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

// Function to get the current date in IST timezone
function getCurrentDateInIST() {
    const ISTOffset = 5.5 * 60; // IST is UTC +5:30
    const date = new Date();
    const localTime = date.getTime();
    const localOffset = date.getTimezoneOffset() * 60000; // in milliseconds
    const ISTTime = new Date(localTime + localOffset + ISTOffset * 60000);
    return ISTTime;
}

// Function to get the current date in 'YYYY-MM-DD' format
function getFormattedCurrentDate() {
    const currentDate = getCurrentDateInIST();
    return currentDate.toISOString().split('T')[0]; // Format as 'YYYY-MM-DD'
}

// Get the current date for both start and end date
const startDate = getFormattedCurrentDate();  // Set start date as today's date
const endDate = startDate;   // Set end date as today's date

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

    -- Sum the WORKING values, exclude rows where WORKING is 0 or NULL
    SUM(CASE WHEN D.AVAILABLE IS NOT NULL AND D.AVAILABLE != 0 THEN D.AVAILABLE ELSE 0 END) AS AVAILABLE,
    
    -- Sum the AVAILABLE values, replacing NULLs with 0
    SUM(ISNULL(D.AUTHORIZED, 0)) AS AUTHORIZED,
    
    -- Sum the NOTWORKING values, replacing NULLs with 0
    SUM(ISNULL(D.DEFICIENCY, 0)) AS DEFICIENCY

FROM 
    DSRAGENCYSECSTAFF D  -- Data comes from DSRSECAUTO
LEFT JOIN SITE S ON S.SIID = D.SIID   -- Join SITE on SIID
LEFT JOIN VERTICAL V ON V.VID = S.VID -- Join VERTICAL table on VID
LEFT JOIN BUSINESS B ON B.BUID = S.BUID -- Join BUSINESS table on BUID

WHERE 
    D.DSRDATE BETWEEN @startDate AND @endDate  -- Date range filter (single date in this case)
    AND S.SISTATUS = 'ACTIVE'  -- Only active sites
    AND D.DSRPARAMSNAME NOT IN ('DEV DOG SECURITY' , 'NETAMBIT' , 'PSA' , 'CSPL SBU' , 'SECURE 1' , 'ASG' , 'Lumiere' ,
    'ISSSDB' , 'ARNI ENGINEERING' , 'Champion Pushpak' , 'KRYSTAL' , 'QUESS' , 'INVICTUS' , 'ARPL' , 'INNOV' , 'RANDSTAND' ,
    'CRISTAL' , 'LSS' , 'SHIV ENGINEERING' , 'MANPOWER' , 'CSPL')
    -- The condition for WORKING: exclude rows where WORKING is 0 or NULL
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
    D.DSRDATE
ORDER BY 
    D.DSRDATE, S.SIID;  -- Order by DSRDATE and SIID`;

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
            const maxRowIdQuery = `SELECT MAX(ROWID) AS MaxRowID FROM [dbo].[OL_DASHBOARD_DAILY_AGENCY]`;
            const maxRowIdResult = await pool.request().query(maxRowIdQuery);
            const maxRowId = maxRowIdResult.recordset[0].MaxRowID || 0;  // If no rows, set ROWID to 0
            const newRowId = maxRowId + 1; // Increment ROWID by 1 for each iteration

            // Check if the record exists in OL_DASHBOARD_DAILY
            const checkQuery = `SELECT COUNT(*) AS RecordCount
                                FROM [dbo].[OL_DASHBOARD_DAILY_AGENCY]
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
                    UPDATE [dbo].[OL_DASHBOARD_DAILY_AGENCY]
                    SET 
                        [AVAILABLE] = @AVAILABLE,
                        [AUTHORIZED] = @AUTHORIZED,
                        [DEFICIENCY] = @DEFICIENCY,
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
                    .input('AUTHORIZED', sql.Int, incidentRow.AUTHORIZED)
                    .input('DEFICIENCY', sql.Int, incidentRow.DEFICIENCY)
                    .input('MONTH', sql.Int, month)
                    .input('QUARTER', sql.Int, quarter)
                    .input('MONTHNAME', sql.NVarChar, monthName)
                    .input('YEAR' , sql.Int , year)
                    .query(updateQuery);

                updateCount++;  // Increment update counter
            } else {
                // Insert new record
                const insertQuery = `
                    INSERT INTO [dbo].[OL_DASHBOARD_DAILY_AGENCY]
                    ([ROWID],  [VID], [BUID], [SIID],[VNAME], [BUNAME], [SINAME], [VCODE], [BUCODE], [SICODE], [DATE], 
                     [AVAILABLE], [AUTHORIZED] , [DEFICIENCY] , 
                    [MONTH], [QUARTER], [MONTHNAME] , [YEAR] )
                    VALUES 
                    (@ROWID, @VID , @BUID , @SIID , @VNAME, @BUNAME, @SINAME, @VCODE, @BUCODE, @SICODE, @DATE, 
                     @AVAILABLE, @AUTHORIZED , @DEFICIENCY,
                    @MONTH, @QUARTER, @MONTHNAME , @YEAR );
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
                    .query(insertQuery);
                
                insertCount++;  // Increment insert counter
            }
        }

        console.log(`${insertCount} records inserted.`);
        console.log(`${updateCount} records updated.`);

    } catch (err) {
        console.error("Error inserting or updating dashboard:", err);
    }
}

// Execute the SQL query and process the results
async function executeQueryAndProcessData() {
    try {
        const pool = await sql.connect(config);
        const result = await pool.request()
            .input('startDate', sql.Date, startDate) // Pass the dynamically calculated startDate
            .input('endDate', sql.Date, endDate) // Pass the dynamically calculated endDate
            .query(qIncident);

        // Process the incident data
        await insertOrUpdateDashboard(result.recordset, startDate); // Use the current date as the date to be inserted

    } catch (err) {
        console.error("Error executing query:", err);
    }
}

executeQueryAndProcessData();
