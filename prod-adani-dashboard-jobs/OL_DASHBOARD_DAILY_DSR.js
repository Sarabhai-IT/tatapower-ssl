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
// const startDate = '2025-02-01';  // Start Date   
// const endDate = '2025-03-18';    // End Date

// Get the current date and subtract one day to get the previous day
const currentDate = new Date();
currentDate.setDate(currentDate.getDate() - 1);  // Subtract 1 day to get D-1
const previousDay = currentDate.toISOString().slice(0, 10);  // Format as 'YYYY-MM-DD'

// Use previousDay for both startDate and endDate
const startDate = previousDay;  // Previous day as start date
const endDate = previousDay;    // Previous day as end date

console.log(`Start Date: ${startDate}`);
console.log(`End Date: ${endDate}`);

const poolPromise = sql.connect(config);

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

    -- Display the values for each DSRDATE separately without averaging
    CAST(ISNULL(CASE WHEN D.CCTV = 'null' THEN 0 ELSE D.CCTV END, 0) AS INT) AS CCTV,
    CAST(ISNULL(CASE WHEN D.ACS = 'null' THEN 0 ELSE D.ACS END, 0) AS INT) AS ACS,
    CAST(ISNULL(CASE WHEN (D.TOOLBOXSECURITY = 'null' OR D.TOOLBOXSAFETY = 'null') 
        THEN 0 ELSE (CAST(D.TOOLBOXSECURITY AS INT) + CAST(D.TOOLBOXSAFETY AS INT)) END, 0) AS INT) AS TOOLBOX,
    CAST(ISNULL(CASE WHEN (D.TRAININGONROLL = 'null' OR D.TRAININGOFFROLL = 'null') 
        THEN 0 ELSE (CAST(D.TRAININGONROLL AS INT) + CAST(D.TRAININGOFFROLL AS INT)) END, 0) AS INT) AS TRAINING,
    CAST(ISNULL(CASE WHEN D.SECURITYMOCKDRILLS = 'null' THEN 0 ELSE D.SECURITYMOCKDRILLS END, 0) AS INT) AS SECURITYMOCKDRILLS,
    CAST(ISNULL(CASE WHEN D.SURPRISEROUND = 'null' THEN 0 ELSE D.SURPRISEROUND END, 0) AS INT) AS SURPRISEROUND

FROM 
    DSRKEYHIGHLIGHTS D  -- Data comes from DSRKEYHIGHLIGHTS
LEFT JOIN SITE S ON S.SIID = D.SIID   -- Join SITE on SIID
LEFT JOIN VERTICAL V ON V.VID = S.VID -- Join VERTICAL table on VID
LEFT JOIN BUSINESS B ON B.BUID = S.BUID -- Join BUSINESS table on BUID
WHERE 
    D.DSRDATE BETWEEN @startDate AND @endDate  -- Date range filter
    AND S.SISTATUS = 'ACTIVE'  -- Only active sites
ORDER BY 
    D.DSRDATE, S.SIID;  -- Order by DSRDATE and SIID

`;

const qStaff = `
    SELECT 
        I.VID,
        I.BUID,
        I.SIID,
        S.SINAME, 
        S.SICODE,
        I.DSRDATE,  -- Including DSRDATE as you requested

        -- Average calculations: sum divided by the number of days in the range
        CAST(COALESCE(SUM(I.REQUIRED), 0) AS INT) AS SEC_STAFF_REQ,
        CAST(COALESCE(SUM(I.AVAILABLE), 0) AS INT) AS SEC_STAFF_AVL,
        CAST(COALESCE(SUM(I.GAP), 0) AS INT) AS SEC_STAFF_DEF

    FROM DSRSECSTAFFONROLL I
    LEFT JOIN SITE S ON I.SIID = S.SIID  -- LEFT JOIN on the SITE table
        AND S.SISTATUS = 'ACTIVE'  -- Filtering for active sites
    WHERE I.DSRDATE BETWEEN @startDate AND @endDate  -- Filtering for the date range
    GROUP BY 
        I.VID,
        I.BUID,
        I.SIID,
        S.SINAME, 
        S.SICODE,
        I.DSRDATE;  -- Group by DSRDATE to get results for each day separately
`;

const qAgency = `
SELECT 
    I.VID,
    I.BUID,
    I.SIID,
    S.SINAME, 
    S.SICODE,
    I.DSRDATE,  -- Including DSRDATE in the SELECT clause

    -- Sum calculations for the columns
    CAST(COALESCE(SUM(I.AUTHORIZED), 0) AS INT) AS AGENCY_AUTH,
    CAST(COALESCE(SUM(I.AVAILABLE), 0) AS INT) AS AGENCY_AVL,
    CAST(COALESCE(SUM(I.DEFICIENCY), 0) AS INT) AS AGENCY_DEF,

    -- Percentage calculations
    CAST(COALESCE(SUM(I.AVAILABLE), 0) * 100.0 / NULLIF(SUM(I.AUTHORIZED), 0) AS DECIMAL(10)) AS PERCENT_AVL,
    CAST(COALESCE(SUM(I.DEFICIENCY), 0) * 100.0 / NULLIF(SUM(I.AUTHORIZED), 0) AS DECIMAL(10, 2)) AS PERCENT_DEF,

    -- Average calculations: sum divided by the count of distinct DSRDATE values for each SIID
    CAST(COALESCE(SUM(I.AUTHORIZED), 0) / NULLIF(COUNT(DISTINCT I.DSRDATE), 0) AS DECIMAL(10, 2)) AS AGENCY_AUTH_AVG,
    CAST(COALESCE(SUM(I.AVAILABLE), 0) / NULLIF(COUNT(DISTINCT I.DSRDATE), 0) AS DECIMAL(10, 2)) AS AGENCY_AVL_AVG,
    CAST(COALESCE(SUM(I.DEFICIENCY), 0) / NULLIF(COUNT(DISTINCT I.DSRDATE), 0) AS DECIMAL(10, 2)) AS AGENCY_DEF_AVG,

    -- Count the distinct DSRPARAMSNAME for each SIID
    COUNT(DISTINCT I.DSRPARAMSNAME) AS AGENCY_COUNT

FROM DSRAGENCYSECSTAFF I
LEFT JOIN SITE S ON I.SIID = S.SIID  -- LEFT JOIN on the SITE table
    AND S.SISTATUS = 'ACTIVE'  -- Filtering for active sites
WHERE I.DSRDATE BETWEEN @startDate AND @endDate  -- Filtering for the date range
GROUP BY 
    I.VID,
    I.BUID,
    I.SIID,
    S.SINAME, 
    S.SICODE,
    I.DSRDATE;`;

const qCCTV = `
SELECT 
    I.VID,
    I.BUID,
    I.SIID,
    S.SINAME, 
    S.SICODE,
    I.DSRDATE,  -- Including DSRDATE in the SELECT clause

    -- Average calculations: sum divided by the number of days in the range
    CAST(COALESCE(SUM(I.AVAILABLE), 0) AS INT) AS CCTV_AVL,
    CAST(COALESCE(SUM(I.WORKING), 0) AS INT) AS CCTV_WORKING,
    CAST(COALESCE(SUM(I.NOTWORKING), 0) AS INT) AS CCTV_NOTWORKING
FROM (
    SELECT 
        SIID, VID, BUID, DSRDATE, DSRPARAMSNAME, 
        SUM(AVAILABLE) AS AVAILABLE, 
        SUM(WORKING) AS WORKING, 
        SUM(NOTWORKING) AS NOTWORKING
    FROM DSRSECAUTO
    WHERE DSRPARAMSNAME = 'CAMERA'
    GROUP BY SIID, VID, BUID, DSRDATE, DSRPARAMSNAME
) I
LEFT JOIN SITE S 
    ON I.SIID = S.SIID  
    AND S.SISTATUS = 'ACTIVE'  
WHERE I.DSRDATE BETWEEN @startDate AND @endDate 
GROUP BY 
    I.VID,
    I.BUID,
    I.SIID,
    S.SINAME, 
    S.SICODE,
    I.DSRDATE;

`

const qACS = `
SELECT 
    I.VID,
    I.BUID,
    I.SIID,
    S.SINAME, 
    S.SICODE,
    I.DSRDATE,  -- Including DSRDATE in the SELECT clause

    -- Average calculations: sum divided by the number of days in the range
    CAST(COALESCE(SUM(I.AVAILABLE), 0) AS INT) AS ACS_AVL,
    CAST(COALESCE(SUM(I.WORKING), 0) AS INT) AS ACS_WORKING,
    CAST(COALESCE(SUM(I.NOTWORKING), 0) AS INT) AS ACS_NOTWORKING
FROM (
    SELECT 
        SIID, VID, BUID, DSRDATE, DSRPARAMSNAME, 
        SUM(AVAILABLE) AS AVAILABLE, 
        SUM(WORKING) AS WORKING, 
        SUM(NOTWORKING) AS NOTWORKING
    FROM DSRSECAUTO
    WHERE DSRPARAMSNAME IN ('ACCESS CONTROL DEVICE', 'BOOM BARRIER', 'DOOR FRAME METAL DETECTOR', 'FLAP BARRIER', 'FRS', 'GATES', 'TRIPOD', 'TURN STILES')
    GROUP BY SIID, VID, BUID, DSRDATE, DSRPARAMSNAME
) I
LEFT JOIN SITE S 
    ON I.SIID = S.SIID  
    AND S.SISTATUS = 'ACTIVE'  
WHERE I.DSRDATE BETWEEN @startDate AND @endDate 
GROUP BY 
    I.VID,
    I.BUID,
    I.SIID,
    S.SINAME, 
    S.SICODE,
    I.DSRDATE;

`

const qTotalDevice = `
SELECT 
    I.VID,
    I.BUID,
    I.SIID,
    S.SINAME, 
    S.SICODE,
    I.DSRDATE,  -- Including DSRDATE in the SELECT clause

    -- Average calculations: sum divided by the number of days in the range
    CAST(COALESCE(SUM(I.AVAILABLE), 0) AS INT) AS TOTAL_DEVICE_AVL,
    CAST(COALESCE(SUM(I.WORKING), 0) AS INT) AS TOTAL_DEVICE_WORKING,
    CAST(COALESCE(SUM(I.NOTWORKING), 0) AS INT) AS TOTAL_DEVICE_NOTWORKING
FROM (
    SELECT 
        SIID, VID, BUID, DSRDATE, DSRPARAMSNAME, 
        SUM(AVAILABLE) AS AVAILABLE, 
        SUM(WORKING) AS WORKING, 
        SUM(NOTWORKING) AS NOTWORKING
    FROM DSRSECAUTO
    GROUP BY SIID, VID, BUID, DSRDATE, DSRPARAMSNAME
) I
LEFT JOIN SITE S 
    ON I.SIID = S.SIID  
    AND S.SISTATUS = 'ACTIVE'  
WHERE I.DSRDATE BETWEEN @startDate AND @endDate 
GROUP BY 
    I.VID,
    I.BUID,
    I.SIID,
    S.SINAME, 
    S.SICODE,
    I.DSRDATE;

`

async function processIncidents() {
    const pool = await poolPromise;

    // Fetch incidents from the database
    const result = await pool.request()
        .input('startDate', sql.Date, startDate)
        .input('endDate', sql.Date, endDate)
        .query(qIncident);

    // Fetch security staff data from the second query
    const staffResult = await pool.request()
        .input('startDate', sql.Date, startDate)
        .input('endDate', sql.Date, endDate)
        .query(qStaff);

     // Fetch security staff data from the second query
     const agencyResult = await pool.request()
     .input('startDate', sql.Date, startDate)
     .input('endDate', sql.Date, endDate)
     .query(qAgency);

       // Fetch security staff data from the second query
       const cctvResult = await pool.request()
       .input('startDate', sql.Date, startDate)
       .input('endDate', sql.Date, endDate)
       .query(qCCTV);

         // Fetch security staff data from the second query
         const acsResult = await pool.request()
         .input('startDate', sql.Date, startDate)
         .input('endDate', sql.Date, endDate)
         .query(qACS);

          // Fetch security staff data from the second query
          const totalDeviceResult = await pool.request()
          .input('startDate', sql.Date, startDate)
          .input('endDate', sql.Date, endDate)
          .query(qTotalDevice);

    let insertCount = 0;
    let updateCount = 0;

    // Loop through the incident data
    for (const incidentRow of result.recordset) {
        const siid = incidentRow.SIID;
        const vid = incidentRow.VID;
        const buid = incidentRow.BUID;
        const siname = incidentRow.SINAME;
        const sicode = incidentRow.SICODE;
        const vname = incidentRow.VNAME;
        const vcode = incidentRow.VCODE;
        const buname = incidentRow.BUNAME;
        const bucode = incidentRow.BUCODE;
        const incidentDate = new Date(incidentRow.DSRDATE); // DSRDATE in a proper Date format

        // Extract month, quarter, year, and month name
        const month = incidentDate.getMonth() + 1; // 1-based index (January = 1)
        const quarter = Math.ceil(month / 3);  // Calculate quarter (1-4)
        const monthName = incidentDate.toLocaleString('default', { month: 'short' }).toUpperCase(); // Jan, Feb, Mar, etc.
        const year = incidentDate.getFullYear(); // Get year (e.g., 2024)

        // Format the date as 'YYYY-MM-DD'
        const formattedDate = incidentDate.toISOString().slice(0, 10);  // '2024-07-01'

        // Get the corresponding SEC_STAFF data from the second query
        const staffRow = staffResult.recordset.find(staff => staff.SIID === siid && staff.DSRDATE === formattedDate);
        const aencyRow = agencyResult.recordset.find(agency => agency.SIID === siid && agency.DSRDATE === formattedDate);
        const cctvRow = cctvResult.recordset.find(cctv => cctv.SIID === siid && cctv.DSRDATE === formattedDate);
        const acsRow = acsResult.recordset.find(acs => acs.SIID === siid && acs.DSRDATE === formattedDate);
        const totalDeviceRow = totalDeviceResult.recordset.find(totalDevice => totalDevice.SIID === siid && totalDevice.DSRDATE === formattedDate);

        // If staffRow exists, get the staff values
        const secStaffReq = staffRow ? staffRow.SEC_STAFF_REQ : 0;
        const secStaffAvl = staffRow ? staffRow.SEC_STAFF_AVL : 0;
        const secStaffDef = staffRow ? staffRow.SEC_STAFF_DEF : 0;

         // If aencyRow exists, get the aencyRow values
         const agencyAuth = aencyRow ? aencyRow.AGENCY_AUTH : 0;
         const agencyAvl = aencyRow ? aencyRow.AGENCY_AVL : 0;
         const agencyDef = aencyRow ? aencyRow.AGENCY_DEF : 0;
         const agencyCount = aencyRow ? aencyRow.AGENCY_COUNT : 0;
         const agencyAvlAvg = aencyRow ? aencyRow.PERCENT_AVL : 0;

         console.log(agencyAvl , agencyAvlAvg);


           // If cctvRow exists, get the cctvRow values
           const cctvAvl = cctvRow ? cctvRow.CCTV_AVL : 0;
           const cctvWorking = cctvRow ? cctvRow.CCTV_WORKING : 0;
           const cctvNotworking = cctvRow ? cctvRow.CCTV_NOTWORKING : 0;

            // If acsRow exists, get the acsRow values
            const acsAvl = acsRow ? acsRow.ACS_AVL : 0;
            const acsWorking = acsRow ? acsRow.ACS_WORKING : 0;
            const acsNotworking = acsRow ? acsRow.ACS_NOTWORKING : 0;
 
                // If totalDeviceRow exists, get the totalDeviceRow values
                const totalDeviceAvl = totalDeviceRow ? totalDeviceRow.TOTAL_DEVICE_AVL : 0;
                const totalDeviceWorking = totalDeviceRow ? totalDeviceRow.TOTAL_DEVICE_WORKING : 0;
                const totalDeviceNotworking = totalDeviceRow ? totalDeviceRow.TOTAL_DEVICE_NOTWORKING : 0;
     
        // Get the next available RowID (Max RowID + 1)
        const maxRowIdResult = await pool.request()
            .query('SELECT MAX(ROWID) AS MAXROWID FROM [dbo].[OL_DASHBOARD_DAILY_KEYHIGHLIGHTS]');
        const maxRowId = maxRowIdResult.recordset[0].MAXROWID || 0;  // If no rows exist, start from 0
        const newRowId = maxRowId + 1;  // Increment by 1

        // Check if the record exists
        const checkQuery = `
            SELECT COUNT(*) AS RecordCount
            FROM [dbo].[OL_DASHBOARD_DAILY_KEYHIGHLIGHTS]
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
                UPDATE [dbo].[OL_DASHBOARD_DAILY_KEYHIGHLIGHTS]
                SET 
                    [SINAME] = @SINAME,
                    [SICODE] = @SICODE,
                    [VNAME] = @VNAME,
                    [VCODE] = @VCODE,
                    [BUNAME] = @BUNAME,
                    [BUCODE] = @BUCODE,
                    [MONTH] = @MONTH,
                    [QUARTER] = @QUARTER,
                    [MONTHNAME] = @MONTHNAME,
                    [YEAR] = @YEAR,
                    [SITECOUNT] = @SITECOUNT,
                    [CCTV] = @CCTV,
                    [ACS] = @ACS,
                    [TOOLBOX] = @TOOLBOX,
                    [TRAINING] = @TRAINING,
                    [SECURITYMOCKDRILLS] = @SECURITYMOCKDRILLS,
                    [SURPRISEROUND] = @SURPRISEROUND,
                    [SEC_STAFF_REQ] = @SEC_STAFF_REQ,
                    [SEC_STAFF_AVL] = @SEC_STAFF_AVL,
                    [SEC_STAFF_DEF] = @SEC_STAFF_DEF,
                     [AGENCY_AUTH] = @AGENCY_AUTH,
                    [AGENCY_AVL] = @AGENCY_AVL,
                    [AGENCY_DEF] = @AGENCY_DEF,
                    [AGENCY_COUNT] = @AGENCY_COUNT,
                    [AGENCY_AVL_AVG] = @AGENCY_AVL_AVG,
                    [CCTV_AVL] = @CCTV_AVL,
                    [CCTV_WORKING] = @CCTV_WORKING,
                    [CCTV_NOTWORKING] = @CCTV_NOTWORKING,
                    [ACS_AVL] = @ACS_AVL,
                    [ACS_WORKING] = @ACS_WORKING,
                    [ACS_NOTWORKING] = @ACS_NOTWORKING,
                     [TOTAL_DEVICE_AVL] = @TOTAL_DEVICE_AVL,
                    [TOTAL_DEVICE_WORKING] = @TOTAL_DEVICE_WORKING,
                    [TOTAL_DEVICE_NOTWORKING] = @TOTAL_DEVICE_NOTWORKING
                WHERE 
                    [SIID] = @SIID AND [VID] = @VID AND [BUID] = @BUID AND [DATE] = @DATE
            `;
            await pool.request()
                .input('SIID', sql.Int, siid)
                .input('VID', sql.Int, vid)
                .input('BUID', sql.Int, buid)
                .input('SINAME', sql.NVarChar, siname)
                .input('SICODE', sql.NVarChar, sicode)
                .input('VNAME', sql.NVarChar, vname)
                .input('VCODE', sql.NVarChar, vcode)
                .input('BUNAME', sql.NVarChar, buname)
                .input('BUCODE', sql.NVarChar, bucode)
                .input('DATE', sql.NVarChar, formattedDate)
                .input('CCTV', sql.Int, incidentRow.CCTV)
                .input('ACS', sql.Int, incidentRow.ACS)
                .input('TOOLBOX', sql.Int, incidentRow.TOOLBOX)
                .input('TRAINING', sql.Int, incidentRow.TRAINING)
                .input('SECURITYMOCKDRILLS', sql.Int, incidentRow.SECURITYMOCKDRILLS)
                .input('SURPRISEROUND', sql.Int, incidentRow.SURPRISEROUND)
                .input('MONTH', sql.Int, month)
                .input('QUARTER', sql.Int, quarter)
                .input('MONTHNAME', sql.NVarChar, monthName)
                .input('YEAR', sql.Int, year)
                .input('SITECOUNT', sql.Int, 1) // SITECOUNT is 1
                .input('SEC_STAFF_REQ', sql.Int, secStaffReq)
                .input('SEC_STAFF_AVL', sql.Int, secStaffAvl)
                .input('SEC_STAFF_DEF', sql.Int, secStaffDef)
                .input('AGENCY_AUTH', sql.Int, agencyAuth)
                .input('AGENCY_AVL', sql.Int, agencyAvl)
                .input('AGENCY_DEF', sql.Int, agencyDef)
                .input('AGENCY_COUNT', sql.Int, agencyCount)
                .input('AGENCY_AVL_AVG', sql.Int, agencyAvlAvg)
                .input('CCTV_AVL', sql.Int, cctvAvl)
                .input('CCTV_WORKING', sql.Int, cctvWorking)
                .input('CCTV_NOTWORKING', sql.Int, cctvNotworking)
                .input('ACS_AVL', sql.Int, acsAvl)
                .input('ACS_WORKING', sql.Int, acsWorking)
                .input('ACS_NOTWORKING', sql.Int, acsNotworking)
                .input('TOTAL_DEVICE_AVL', sql.Int, totalDeviceAvl)
                .input('TOTAL_DEVICE_WORKING', sql.Int, totalDeviceWorking)
                .input('TOTAL_DEVICE_NOTWORKING', sql.Int, totalDeviceNotworking)
                .query(updateQuery);

            updateCount++;  // Increment update counter
        } else {
            // Insert new record
            const insertQuery = `
                INSERT INTO [dbo].[OL_DASHBOARD_DAILY_KEYHIGHLIGHTS]
                ([ROWID], [VNAME], [VCODE], [BUNAME], [BUCODE], [SINAME], [SICODE], [SIID], [VID], [BUID], [DATE], 
                [CCTV], [ACS], [TOOLBOX], [TRAINING], [SECURITYMOCKDRILLS], [SURPRISEROUND], 
                [MONTH], [QUARTER], [MONTHNAME], [YEAR], [SITECOUNT],
                [SEC_STAFF_REQ], [SEC_STAFF_AVL], [SEC_STAFF_DEF] , [AGENCY_AUTH], [AGENCY_AVL], [AGENCY_DEF],[AGENCY_COUNT],[AGENCY_AVL_AVG],
                 [CCTV_AVL], [CCTV_WORKING], [CCTV_NOTWORKING] , [ACS_AVL], [ACS_WORKING], [ACS_NOTWORKING],
                  [TOTAL_DEVICE_AVL], [TOTAL_DEVICE_WORKING], [TOTAL_DEVICE_NOTWORKING])
                VALUES 
                (@ROWID, @VNAME, @VCODE, @BUNAME, @BUCODE, @SINAME, @SICODE, @SIID, @VID, @BUID, @DATE, 
                @CCTV, @ACS, @TOOLBOX, @TRAINING, @SECURITYMOCKDRILLS, @SURPRISEROUND, 
                @MONTH, @QUARTER, @MONTHNAME, @YEAR, @SITECOUNT,
                @SEC_STAFF_REQ, @SEC_STAFF_AVL, @SEC_STAFF_DEF , @AGENCY_AUTH, @AGENCY_AVL, @AGENCY_DEF,@AGENCY_COUNT,@AGENCY_AVL_AVG,
                @CCTV_AVL, @CCTV_WORKING, @CCTV_NOTWORKING , @ACS_AVL, @ACS_WORKING, @ACS_NOTWORKING , 
                @TOTAL_DEVICE_AVL, @TOTAL_DEVICE_WORKING, @TOTAL_DEVICE_NOTWORKING);
            `;
            await pool.request()
                .input('ROWID', sql.Int, newRowId)
                .input('VNAME', sql.NVarChar, vname)
                .input('VCODE', sql.NVarChar, vcode)
                .input('BUNAME', sql.NVarChar, buname)
                .input('BUCODE', sql.NVarChar, bucode)
                .input('SINAME', sql.NVarChar, siname)
                .input('SICODE', sql.NVarChar, sicode)
                .input('SIID', sql.Int, siid)
                .input('VID', sql.Int, vid)
                .input('BUID', sql.Int, buid)
                .input('DATE', sql.NVarChar, formattedDate)
                .input('CCTV', sql.Int, incidentRow.CCTV)
                .input('ACS', sql.Int, incidentRow.ACS)
                .input('TOOLBOX', sql.Int, incidentRow.TOOLBOX)
                .input('TRAINING', sql.Int, incidentRow.TRAINING)
                .input('SECURITYMOCKDRILLS', sql.Int, incidentRow.SECURITYMOCKDRILLS)
                .input('SURPRISEROUND', sql.Int, incidentRow.SURPRISEROUND)
                .input('MONTH', sql.Int, month)
                .input('QUARTER', sql.Int, quarter)
                .input('MONTHNAME', sql.NVarChar, monthName)
                .input('YEAR', sql.Int, year)
                .input('SITECOUNT', sql.Int, 1)  // SITECOUNT is 1
                .input('SEC_STAFF_REQ', sql.Int, secStaffReq)
                .input('SEC_STAFF_AVL', sql.Int, secStaffAvl)
                .input('SEC_STAFF_DEF', sql.Int, secStaffDef)
                .input('AGENCY_AUTH', sql.Int, agencyAuth)
                .input('AGENCY_AVL', sql.Int, agencyAvl)
                .input('AGENCY_DEF', sql.Int, agencyDef)
                .input('AGENCY_COUNT', sql.Int, agencyCount)
                .input('AGENCY_AVL_AVG', sql.Int, agencyAvlAvg)
                .input('CCTV_AVL', sql.Int, cctvAvl)
                .input('CCTV_WORKING', sql.Int, cctvWorking)
                .input('CCTV_NOTWORKING', sql.Int, cctvNotworking)
                .input('ACS_AVL', sql.Int, acsAvl)
                .input('ACS_WORKING', sql.Int, acsWorking)
                .input('ACS_NOTWORKING', sql.Int, acsNotworking)
                .input('TOTAL_DEVICE_AVL', sql.Int, totalDeviceAvl)
                .input('TOTAL_DEVICE_WORKING', sql.Int, totalDeviceWorking)
                .input('TOTAL_DEVICE_NOTWORKING', sql.Int, totalDeviceNotworking)
                .query(insertQuery);

            insertCount++;  // Increment insert counter
        }
    }

    console.log(`${insertCount} rows inserted, ${updateCount} rows updated.`);
}


// Run the process
processIncidents().catch((err) => console.log(err));
