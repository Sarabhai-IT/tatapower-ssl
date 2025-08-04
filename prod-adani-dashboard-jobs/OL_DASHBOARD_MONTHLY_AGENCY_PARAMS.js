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
        trustServerCertificate: true
    }
};
// const config = {
//     server: 'az01ismsproddbds01.database.windows.net',
//     user: 'sqladminuser',
//     password: 'pZxxzYRJ#32[',
//     database: 'az01ismsproddbd01',
//     port: 1433,
//     options: {
//         encrypt: true, // Use this if you're on Azure
//         trustServerCertificate: false // Change as needed based on your SSL setup
//     }
// };

// Hardcoded Date Range (for example, from July 1, 2024 to August 19, 2024)
const startDate = '2025-01-01';  // Start Date
const endDate = '2025-04-31';    // End Date

// Get the current date
const currentDate = new Date();

// Set startDate to the first day of the current month
// const startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
//   .toISOString()
//   .slice(0, 10); // Format as 'YYYY-MM-DD'
 
// // Set endDate to the current date
// const endDate = currentDate.toISOString().slice(0, 10); // Format as 'YYYY-MM-DD'

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
    YEAR(D.DSRDATE) AS YEAR,  -- Extract the year from DSRDATE
    MONTH(D.DSRDATE) AS MONTH,  -- Extract the month from DSRDATE
    -- Sum the AVAILABLE values, exclude rows where AVAILABLE is 0 or NULL
    (SUM(CASE WHEN D.AVAILABLE IS NOT NULL AND D.AVAILABLE != 0 THEN D.AVAILABLE ELSE 0 END)
     / COUNT(DISTINCT D.DSRDATE)) AS MONTHLY_AVAILABLE,
    -- Calculate the monthly average for AUTHORIZED per day
    (SUM(ISNULL(D.APPROVED, 0)) / COUNT(DISTINCT D.DSRDATE)) AS MONTHLY_AUTHORIZED,
    -- Calculate the monthly average for DEFICIENCY per day
    (SUM(ISNULL(D.DEFICIENCY, 0)) / COUNT(DISTINCT D.DSRDATE)) AS MONTHLY_DEFICIENCY,
    -- Add DSRPARAMSNAME if it exists in the DSRSECAUTO table
    D.DSRPARAMSNAME,  -- Add this field from the DSRSECAUTO table (assuming it exists),
    UPPER(LEFT(DATENAME(MONTH, D.DSRDATE), 3)) AS MONTHNAME,  -- Get 3-letter month name
    -- Calculate quarter
    CASE
        WHEN MONTH(D.DSRDATE) BETWEEN 1 AND 3 THEN 4
        WHEN MONTH(D.DSRDATE) BETWEEN 4 AND 6 THEN 1
        WHEN MONTH(D.DSRDATE) BETWEEN 7 AND 9 THEN 2
        WHEN MONTH(D.DSRDATE) BETWEEN 10 AND 12 THEN 3
    END AS QUARTER
FROM
    DSRAGENCYSECSTAFF D  -- Data comes from DSRSECAUTO
LEFT JOIN SITE S ON S.SIID = D.SIID   -- Join SITE on SIID
LEFT JOIN VERTICAL V ON V.VID = S.VID -- Join VERTICAL table on VID
LEFT JOIN BUSINESS B ON B.BUID = S.BUID -- Join BUSINESS table on BUID
WHERE
D.DSRDATE BETWEEN @startDate AND @endDate
    AND S.SISTATUS = 'ACTIVE'  -- Only active sites
    AND D.DSRPARAMSNAME NOT IN ('DEV DOG SECURITY', 'NETAMBIT', 'PSA', 'CSPL SBU', 'SECURE 1', 'ASG', 'Lumiere',
    'ISSSDB', 'ARNI ENGINEERING', 'Champion Pushpak', 'KRYSTAL', 'QUESS', 'INVICTUS', 'ARPL', 'INNOV', 'RANDSTAND',
    'CRISTAL', 'LSS', 'SHIV ENGINEERING', 'MANPOWER', 'CSPL', 'G4S', 'BVG', 'MSGB', 'JAGDAMBA')
    AND (D.AVAILABLE IS NOT NULL AND D.AVAILABLE != 0)  -- Exclude rows where AVAILABLE is 0 or NULL
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
    YEAR(D.DSRDATE),
    MONTH(D.DSRDATE),
    D.DSRPARAMSNAME , -- Group by DSRPARAMSNAME along with other fields,
    DATENAME(MONTH, D.DSRDATE)
ORDER BY
    YEAR(D.DSRDATE), MONTH(D.DSRDATE), S.SIID;
`;

// Insert or Update Dashboard Data
async function insertOrUpdateDashboard(incidentData) {
    let insertCount = 0;  // Counter for INSERT queries
    let updateCount = 0;  // Counter for UPDATE queries

    try {
        const pool = await sql.connect(config);

        // Loop through each incident record and merge data from all sources
        for (const incidentRow of incidentData) {
            const siid = incidentRow.SIID;
            const vid = incidentRow.VID;
            const buid = incidentRow.BUID;
            const month = incidentRow.MONTH;  // Use the calculated month from the query
            const year = incidentRow.YEAR;    // Use the calculated year from the query
            const monthName = incidentRow.MONTHNAME;  // Use the calculated month name
            const quarter = incidentRow.QUARTER; // Use the calculated quarter from the query
            const available = incidentRow.MONTHLY_AVAILABLE;  // Availability data
            const required = incidentRow.MONTHLY_AUTHORIZED;  // Availability data
            const gap = incidentRow.MONTHLY_DEFICIENCY;  // Availability data
            const dsrParamsName = incidentRow.DSRPARAMSNAME;

            // Fetch the current max ROWID for each iteration and increment it by 1
            const maxRowIdQuery = `SELECT MAX(ROWID) AS MaxRowID FROM [dbo].[OL_DASHBOARD_MONTHLY_AGENCY_PARAMS]`;
            const maxRowIdResult = await pool.request().query(maxRowIdQuery);
            const maxRowId = maxRowIdResult.recordset[0].MaxRowID || 0;  // If no rows, set ROWID to 0
            const newRowId = maxRowId + 1; // Increment ROWID by 1 for each iteration

            // Check if the record exists in OL_DASHBOARD_MONTHLY_AGENCY_PARAMS
            const checkQuery = `
                SELECT COUNT(*) AS RecordCount
                FROM [dbo].[OL_DASHBOARD_MONTHLY_AGENCY_PARAMS]
                WHERE [SIID] = @SIID AND [VID] = @VID AND [BUID] = @BUID
                AND [MONTH] = @MONTH AND [QUARTER] = @QUARTER AND [YEAR] = @YEAR
                AND [DSRPARAMSNAME] = @DSRPARAMSNAME
            `;

            const checkResult = await pool.request()
                .input('SIID', sql.Int, siid)
                .input('VID', sql.Int, vid)
                .input('BUID', sql.Int, buid)
                .input('MONTH', sql.Int, month)
                .input('QUARTER', sql.Int, quarter)
                .input('YEAR', sql.Int, year)
                .input('DSRPARAMSNAME', sql.NVarChar, dsrParamsName)
                .query(checkQuery);

            const recordExists = checkResult.recordset[0].RecordCount > 0;

            if (recordExists) {
                // Update existing record
                const updateQuery = `
                    UPDATE [dbo].[OL_DASHBOARD_MONTHLY_AGENCY_PARAMS]
                    SET
                        [AVAILABLE] = @AVAILABLE,
                        [AUTHORIZED] = @AUTHORIZED,
                        [DEFICIENCY] = @DEFICIENCY,
                        [MONTHNAME] = @MONTHNAME,
                        [DSRPARAMSNAME] = @DSRPARAMSNAME
                    WHERE
                        [SIID] = @SIID AND [VID] = @VID AND [BUID] = @BUID
                        AND [MONTH] = @MONTH AND [QUARTER] = @QUARTER AND [YEAR] = @YEAR
                        AND [DSRPARAMSNAME] = @DSRPARAMSNAME
                `;
                await pool.request()
                    .input('SIID', sql.Int, siid)
                    .input('VID', sql.Int, vid)
                    .input('BUID', sql.Int, buid)
                    .input('MONTH', sql.Int, month)
                    .input('QUARTER', sql.Int, quarter)
                    .input('YEAR', sql.Int, year)
                    .input('AVAILABLE', sql.Int, available)
                    .input('AUTHORIZED', sql.Int, required)
                    .input('DEFICIENCY', sql.Int, gap)
                    .input('MONTHNAME', sql.NVarChar, monthName)
                    .input('DSRPARAMSNAME', sql.NVarChar, dsrParamsName)
                    .query(updateQuery);

                updateCount++;  // Increment update counter
            } else {
                // Insert new record
                const insertQuery = `
                    INSERT INTO [dbo].[OL_DASHBOARD_MONTHLY_AGENCY_PARAMS]
                    ([ROWID], [VID], [BUID], [SIID], [VNAME], [BUNAME], [SINAME], [VCODE], [BUCODE], [SICODE], [MONTH],
                     [AVAILABLE], [AUTHORIZED], [DEFICIENCY], [QUARTER], [MONTHNAME], [YEAR], [DSRPARAMSNAME])
                    VALUES
                    (@ROWID, @VID, @BUID, @SIID, @VNAME, @BUNAME, @SINAME, @VCODE, @BUCODE, @SICODE, @MONTH,
                     @AVAILABLE, @AUTHORIZED, @DEFICIENCY, @QUARTER, @MONTHNAME, @YEAR, @DSRPARAMSNAME);
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
                    .input('MONTH', sql.Int, month)
                    .input('AVAILABLE', sql.Int, available)
                    .input('AUTHORIZED', sql.Int, required)
                    .input('DEFICIENCY', sql.Int, gap)
                    .input('QUARTER', sql.Int, quarter)
                    .input('MONTHNAME', sql.NVarChar, monthName)
                    .input('YEAR', sql.Int, year)
                    .input('DSRPARAMSNAME', sql.NVarChar, dsrParamsName)
                    .query(insertQuery);

                insertCount++;  // Increment insert counter
            }
        }

        console.log(`Total INSERT queries executed: ${insertCount}`);
        console.log(`Total UPDATE queries executed: ${updateCount}`);
        pool.close();
    } catch (err) {
        console.error("Error in fetching or inserting data:", err);
    }
}

// Fetch and process the incident data, then insert or update
async function fetchAndInsertIncidentData() {
    try {
        const pool = await sql.connect(config);

        // Fetch Incident Data for the given date range
        const incidentResult = await pool.request()
            .input('startDate', sql.Date, startDate)
            .input('endDate', sql.Date, endDate)
            .query(qIncident);

        console.log("Fetched Incident Data:", incidentResult.recordset);

        // Insert or Update the fetched data
        await insertOrUpdateDashboard(incidentResult.recordset);

        pool.close();
    } catch (err) {
        console.error("Error in fetching or processing data:", err);
    }
}

// Run the function to fetch and insert/update data
fetchAndInsertIncidentData();