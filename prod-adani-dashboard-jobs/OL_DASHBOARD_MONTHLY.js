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
const startDate = '2024-11-01';  // Start Date
const endDate = '2024-11-30';    // End Date

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



// SQL Query for fetching Intelligence Count Data with JOIN
const qIntelligence = `
    SELECT 
        S.VID,
        S.BUID,
        S.SIID,
        S.SINAME, 
        S.SICODE, 
        COUNT(I.SIID) AS INTELLIGENCECOUNT
    FROM SITE S
    LEFT JOIN INTELLIGENCE I ON S.SIID = I.SIID 
        AND I.INTELLIGENCEDATE BETWEEN @StartDate AND @EndDate
    WHERE S.SISTATUS = 'ACTIVE'  -- Filtering for active sites
    GROUP BY 
        S.VID,
        S.BUID,
        S.SIID,
        S.SINAME, 
        S.SICODE
`;


// SQL Query for fetching Vigilance Count Data with JOIN
const qVigilance = `
    SELECT 
        S.VID,
        S.BUID,
        S.SIID,
        S.SINAME,
        S.SICODE,
        COUNT(V.SIID) AS VIGILANCECOUNT
    FROM SITE S
    LEFT JOIN VIGILANCE V ON S.SIID = V.SIID
        AND V.OCCURDATE BETWEEN @StartDate AND @EndDate
    WHERE S.SISTATUS = 'ACTIVE'  -- Filtering for active sites
    GROUP BY 
        S.VID,
        S.BUID,
        S.SIID,
        S.SINAME,
        S.SICODE
`;


// const qSecurity = `
//     SELECT 
//         S.VID,
//         S.BUID,
//         S.SIID,
//         S.SINAME,
//         S.SICODE,
//         SUM(CAST(ISNULL(D.CCTV, 0) AS INT)) AS CCTV_SUM,
//         SUM(CAST(ISNULL(D.ACS, 0) AS INT)) AS ACS_SUM,
//         SUM(CAST(ISNULL(D.TOOLBOXSECURITY, 0) AS INT) + CAST(ISNULL(D.TOOLBOXSAFETY, 0) AS INT)) AS TOOLBOX_SUM,
//         SUM(CAST(ISNULL(D.TRAININGONROLL, 0) AS INT) + CAST(ISNULL(D.TRAININGOFFROLL, 0) AS INT)) AS TRAINING_SUM,
//         SUM(CAST(ISNULL(D.SECURITYMOCKDRILLS, 0) AS INT)) AS SECURITYMOCKDRILLS_SUM,
//         SUM(CAST(ISNULL(D.SURPRISEROUND, 0) AS INT)) AS SURPRISEROUND_SUM
//     FROM 
//         SITE S
//     LEFT JOIN DSRKEYHIGHLIGHTS D ON S.SIID = D.SIID
//         AND D.DSRDATE BETWEEN @StartDate AND @EndDate
//     WHERE S.SISTATUS = 'ACTIVE'  -- Filtering for active sites
//     GROUP BY 
//         S.VID,
//         S.BUID,
//         S.SIID,
//         S.SINAME,
//         S.SICODE
// `;

// const qSecurityStaff = `
//     SELECT 
//         S.VID,
//         S.BUID,
//         S.SIID,
//         S.SINAME, 
//         S.SICODE, 
//         COALESCE(SUM(I.REQUIRED), 0) AS SEC_STAFF_REQ,  -- Replaces NULL with 0
//         COALESCE(SUM(I.AVAILABLE), 0) AS SEC_STAFF_AVL, -- Replaces NULL with 0
//         COALESCE(SUM(I.GAP), 0) AS SEC_STAFF_DEF        -- Replaces NULL with 0
//     FROM SITE S
//     LEFT JOIN DSRSECSTAFFONROLL I ON S.SIID = I.SIID 
//         AND I.DSRDATE BETWEEN @StartDate AND @EndDate
//     WHERE S.SISTATUS = 'ACTIVE'  -- Filtering for active sites
//     GROUP BY 
//         S.VID,
//         S.BUID,
//         S.SIID,
//         S.SINAME, 
//         S.SICODE
// `;

// const qAgencySecurityStaff = `
//     SELECT 
//         S.VID,
//         S.BUID,
//         S.SIID,
//         S.SINAME, 
//         S.SICODE, 
//         COALESCE(SUM(I.AUTHORIZED), 0) AS AGENCYSEC_STAFF_AUTH,  -- Replaces NULL with 0
//         COALESCE(SUM(I.AVAILABLE), 0) AS AGENCYSEC_STAFF_AVL, -- Replaces NULL with 0
//         COALESCE(SUM(I.DEFICIENCY), 0) AS AGENCYSEC_STAFF_DEF        -- Replaces NULL with 0
//     FROM SITE S
//     LEFT JOIN DSRAGENCYSECSTAFF I ON S.SIID = I.SIID 
//         AND I.DSRDATE BETWEEN @StartDate AND @EndDate
//     WHERE S.SISTATUS = 'ACTIVE'  -- Filtering for active sites
//     GROUP BY 
//         S.VID,
//         S.BUID,
//         S.SIID,
//         S.SINAME, 
//         S.SICODE
// `;

// const qCCTV = `
//     SELECT 
//     S.VID,
//     S.BUID,
//     S.SIID,
//     S.SINAME, 
//     S.SICODE, 
//     COALESCE(SUM(I.AVAILABLE), 0) AS CAMERA_AVAILABLE,  -- Replaces NULL with 0
//     COALESCE(SUM(I.WORKING), 0) AS CAMERA_WORKING,      -- Replaces NULL with 0
//     COALESCE(SUM(I.NOTWORKING), 0) AS CAMERA_NOT_WORKING -- Replaces NULL with 0
// FROM SITE S
// LEFT JOIN DSRSECAUTO I ON S.SIID = I.SIID 
//     AND I.DSRDATE BETWEEN @StartDate AND @EndDate
// WHERE S.SISTATUS = 'ACTIVE'  -- Filtering for active sites
//     AND (I.DSRPARAMSNAME = 'CAMERA' OR I.DSRPARAMSNAME IS NULL)  -- Ensures 'CAMERA' or no match in DSRSECAUTO
// GROUP BY 
//     S.VID,
//     S.BUID,
//     S.SIID,
//     S.SINAME, 
//     S.SICODE;
// `;

// const qACS = `
//     SELECT 
//         S.VID,
//         S.BUID,
//         S.SIID,
//         S.SINAME, 
//         S.SICODE, 
//         COALESCE(SUM(I.AVAILABLE), 0) AS ACS_AVAILABLE,  -- Replaces NULL with 0
//         COALESCE(SUM(I.WORKING), 0) AS ACS_WORKING,      -- Replaces NULL with 0
//         COALESCE(SUM(I.NOTWORKING), 0) AS ACS_NOT_WORKING  -- Replaces NULL with 0
//     FROM SITE S
//     LEFT JOIN DSRSECAUTO I 
//         ON S.SIID = I.SIID 
//         AND I.DSRDATE BETWEEN @StartDate AND @EndDate
//         AND I.DSRPARAMSNAME IN ('ACCESS CONTROL DEVICE', 'BOOM BARRIER', 'DOOR FRAME METAL DETECTOR', 'FLAP BARRIER', 'FRS', 'GATES', 'TRIPOD', 'TURN STILES')
//     WHERE S.SISTATUS = 'ACTIVE'  -- Filtering for active sites
//     GROUP BY 
//         S.VID,
//         S.BUID,
//         S.SIID,
//         S.SINAME, 
//         S.SICODE
// `;

// const totalAutomaton = `
//     SELECT 
//         S.VID,
//         S.BUID,
//         S.SIID,
//         S.SINAME, 
//         S.SICODE, 
//         COALESCE(SUM(I.AVAILABLE), 0) AS TOTAL_AVAILABLE,  -- Replaces NULL with 0
//         COALESCE(SUM(I.WORKING), 0) AS TOTAL_WORKING,      -- Replaces NULL with 0
//         COALESCE(SUM(I.NOTWORKING), 0) AS TOTAL_NOT_WORKING  -- Replaces NULL with 0
//     FROM SITE S
//     LEFT JOIN DSRSECAUTO I 
//         ON S.SIID = I.SIID 
//         AND I.DSRDATE BETWEEN @StartDate AND @EndDate
//     WHERE S.SISTATUS = 'ACTIVE'  -- Filtering for active sites
//     GROUP BY 
//         S.VID,
//         S.BUID,
//         S.SIID,
//         S.SINAME, 
//         S.SICODE
// `;



const qSecurity = `
SELECT 
S.VID,
S.BUID,
S.SIID,
S.SINAME,
S.SICODE,

-- Average calculations: sum divided by number of days in the range
CAST(SUM(CAST(ISNULL(D.CCTV, 0) AS INT)) AS INT) / (DATEDIFF(DAY, CAST(@StartDate AS DATE), CAST(@EndDate AS DATE)) + 1) AS CCTV_SUM,
CAST(SUM(CAST(ISNULL(D.ACS, 0) AS INT)) AS INT) / (DATEDIFF(DAY, CAST(@StartDate AS DATE), CAST(@EndDate AS DATE)) + 1) AS ACS_SUM,
CAST(SUM(CAST(ISNULL(D.TOOLBOXSECURITY, 0) AS INT) + CAST(ISNULL(D.TOOLBOXSAFETY, 0) AS INT)) AS INT) / (DATEDIFF(DAY, CAST(@StartDate AS DATE), CAST(@EndDate AS DATE)) + 1) AS TOOLBOX_SUM,
CAST(SUM(CAST(ISNULL(D.TRAININGONROLL, 0) AS INT) + CAST(ISNULL(D.TRAININGOFFROLL, 0) AS INT)) AS INT) / (DATEDIFF(DAY, CAST(@StartDate AS DATE), CAST(@EndDate AS DATE)) + 1) AS TRAINING_SUM,
CAST(SUM(CAST(ISNULL(D.SECURITYMOCKDRILLS, 0) AS INT)) AS INT) / (DATEDIFF(DAY, CAST(@StartDate AS DATE), CAST(@EndDate AS DATE)) + 1) AS SECURITYMOCKDRILLS_SUM,
CAST(SUM(CAST(ISNULL(D.SURPRISEROUND, 0) AS INT)) AS INT) / (DATEDIFF(DAY, CAST(@StartDate AS DATE), CAST(@EndDate AS DATE)) + 1) AS SURPRISEROUND_SUM

FROM 
SITE S
LEFT JOIN DSRKEYHIGHLIGHTS D ON S.SIID = D.SIID
AND D.DSRDATE BETWEEN CAST(@StartDate AS DATE) AND CAST(@EndDate AS DATE)
WHERE 
S.SISTATUS = 'ACTIVE'  -- Filtering for active sites,
GROUP BY 
S.VID,
S.BUID,
S.SIID,
S.SINAME,
S.SICODE;

`;

console.log(qSecurity);
const qSecurityStaff = `
SELECT 
S.VID,
S.BUID,
S.SIID,
S.SINAME, 
S.SICODE, 

-- Average calculations: sum divided by the number of days in the range
CAST(COALESCE(SUM(I.REQUIRED), 0) AS INT) / (DATEDIFF(DAY, CAST(@StartDate AS DATE), CAST(@EndDate AS DATE)) + 1) AS SEC_STAFF_REQ,
CAST(COALESCE(SUM(I.AVAILABLE), 0) AS INT) / (DATEDIFF(DAY, CAST(@StartDate AS DATE), CAST(@EndDate AS DATE)) + 1) AS SEC_STAFF_AVL,
CAST(COALESCE(SUM(I.GAP), 0) AS INT) / (DATEDIFF(DAY, CAST(@StartDate AS DATE), CAST(@EndDate AS DATE)) + 1) AS SEC_STAFF_DEF
FROM SITE S
LEFT JOIN DSRSECSTAFFONROLL I ON S.SIID = I.SIID 
AND I.DSRDATE BETWEEN CAST(@StartDate AS DATE) AND CAST(@EndDate AS DATE)
WHERE S.SISTATUS = 'ACTIVE'  -- Filtering for active sites
GROUP BY 
S.VID,
S.BUID,
S.SIID,
S.SINAME, 
S.SICODE;

`;

const qAgencySecurityStaff = `
   
SELECT 
S.VID,
S.BUID,
S.SIID,
S.SINAME, 
S.SICODE, 

-- Average calculations: sum divided by the number of days in the range
CAST(COALESCE(SUM(I.AUTHORIZED), 0) AS INT) / (DATEDIFF(DAY, CAST(@StartDate AS DATE), CAST(@EndDate AS DATE)) + 1) AS AGENCYSEC_STAFF_AUTH,
CAST(COALESCE(SUM(I.AVAILABLE), 0) AS INT) / (DATEDIFF(DAY, CAST(@StartDate AS DATE), CAST(@EndDate AS DATE)) + 1) AS AGENCYSEC_STAFF_AVL,
CAST(COALESCE(SUM(I.DEFICIENCY), 0) AS INT) / (DATEDIFF(DAY, CAST(@StartDate AS DATE), CAST(@EndDate AS DATE)) + 1) AS AGENCYSEC_STAFF_DEF
FROM SITE S
LEFT JOIN DSRAGENCYSECSTAFF I ON S.SIID = I.SIID 
AND I.DSRDATE BETWEEN CAST(@StartDate AS DATE) AND CAST(@EndDate AS DATE)
WHERE S.SISTATUS = 'ACTIVE'  -- Filtering for active sites
GROUP BY 
S.VID,
S.BUID,
S.SIID,
S.SINAME, 
S.SICODE;
`;

const qCCTV = `
SELECT 
S.VID,
S.BUID,
S.SIID,
S.SINAME, 
S.SICODE, 

-- Average calculations: sum divided by the number of days in the range
CAST(COALESCE(SUM(I.AVAILABLE), 0) AS INT) / (DATEDIFF(DAY, CAST(@StartDate AS DATE), CAST(@EndDate AS DATE)) + 1) AS CAMERA_AVAILABLE,
CAST(COALESCE(SUM(I.WORKING), 0) AS INT) / (DATEDIFF(DAY, CAST(@StartDate AS DATE), CAST(@EndDate AS DATE)) + 1) AS CAMERA_WORKING,
CAST(COALESCE(SUM(I.NOTWORKING), 0) AS INT) / (DATEDIFF(DAY, CAST(@StartDate AS DATE), CAST(@EndDate AS DATE)) + 1) AS CAMERA_NOT_WORKING
FROM SITE S
LEFT JOIN DSRSECAUTO I ON S.SIID = I.SIID 
AND I.DSRDATE BETWEEN CAST(@StartDate AS DATE) AND CAST(@EndDate AS DATE)
WHERE S.SISTATUS = 'ACTIVE'  -- Filtering for active sites
AND (I.DSRPARAMSNAME = 'CAMERA' OR I.DSRPARAMSNAME IS NULL)  -- Ensures 'CAMERA' or no match in DSRSECAUTO
GROUP BY 
S.VID,
S.BUID,
S.SIID,
S.SINAME, 
S.SICODE;
`;

const qACS = `
SELECT 
S.VID,
S.BUID,
S.SIID,
S.SINAME, 
S.SICODE, 

-- Average calculations: sum divided by the number of days in the range
CAST(COALESCE(SUM(I.AVAILABLE), 0) AS INT) / (DATEDIFF(DAY, CAST(@StartDate AS DATE), CAST(@EndDate AS DATE)) + 1) AS ACS_AVAILABLE,
CAST(COALESCE(SUM(I.WORKING), 0) AS INT) / (DATEDIFF(DAY, CAST(@StartDate AS DATE), CAST(@EndDate AS DATE)) + 1) AS ACS_WORKING,
CAST(COALESCE(SUM(I.NOTWORKING), 0) AS INT) / (DATEDIFF(DAY, CAST(@StartDate AS DATE), CAST(@EndDate AS DATE)) + 1) AS ACS_NOT_WORKING
FROM SITE S
LEFT JOIN DSRSECAUTO I ON S.SIID = I.SIID 
AND I.DSRDATE BETWEEN CAST(@StartDate AS DATE) AND CAST(@EndDate AS DATE)
AND I.DSRPARAMSNAME IN ('ACCESS CONTROL DEVICE', 'BOOM BARRIER', 'DOOR FRAME METAL DETECTOR', 'FLAP BARRIER', 'FRS', 'GATES', 'TRIPOD', 'TURN STILES')
WHERE S.SISTATUS = 'ACTIVE'  -- Filtering for active sites
GROUP BY 
S.VID,
S.BUID,
S.SIID,
S.SINAME, 
S.SICODE;


`;

const totalAutomaton = `
SELECT 
S.VID,
S.BUID,
S.SIID,
S.SINAME, 
S.SICODE, 

-- Average calculations: sum divided by the number of days in the range
CAST(COALESCE(SUM(I.AVAILABLE), 0) AS INT) / (DATEDIFF(DAY, CAST(@StartDate AS DATE), CAST(@EndDate AS DATE)) + 1) AS TOTAL_AVAILABLE,
CAST(COALESCE(SUM(I.WORKING), 0) AS INT) / (DATEDIFF(DAY, CAST(@StartDate AS DATE), CAST(@EndDate AS DATE)) + 1) AS TOTAL_WORKING,
CAST(COALESCE(SUM(I.NOTWORKING), 0) AS INT) / (DATEDIFF(DAY, CAST(@StartDate AS DATE), CAST(@EndDate AS DATE)) + 1) AS TOTAL_NOT_WORKING
FROM SITE S
LEFT JOIN DSRSECAUTO I ON S.SIID = I.SIID 
AND I.DSRDATE BETWEEN CAST(@StartDate AS DATE) AND CAST(@EndDate AS DATE)
WHERE S.SISTATUS = 'ACTIVE'  -- Filtering for active sites
GROUP BY 
S.VID,
S.BUID,
S.SIID,
S.SINAME, 
S.SICODE;


`;

// Function to fetch monthly data and insert into OL_DASHBOARD_MONTHLY
async function getMonthlyData(startDate, endDate) {
    try {
        // Connect to the database
        const pool = await sql.connect(config);

        // Fetch all the data
        const incidentResult = await pool.request()
            .input('StartDate', sql.Date, startDate)
            .input('EndDate', sql.Date, endDate)
            .query(qIncident);

        const intelligenceResult = await pool.request()
            .input('StartDate', sql.Date, startDate)
            .input('EndDate', sql.Date, endDate)
            .query(qIntelligence);

        const vigilanceResult = await pool.request()
            .input('StartDate', sql.Date, startDate)
            .input('EndDate', sql.Date, endDate)
            .query(qVigilance);

        const securityResult = await pool.request()
            .input('StartDate', sql.Date, startDate)
            .input('EndDate', sql.Date, endDate)
            .query(qSecurity);

        const securityStaffResult = await pool.request()
            .input('StartDate', sql.Date, startDate)
            .input('EndDate', sql.Date, endDate)
            .query(qSecurityStaff);

        const agencySecurityStaffResult = await pool.request()
            .input('StartDate', sql.Date, startDate)
            .input('EndDate', sql.Date, endDate)
            .query(qAgencySecurityStaff);
        const cctvResult = await pool.request()
            .input('StartDate', sql.Date, startDate)
            .input('EndDate', sql.Date, endDate)
            .query(qCCTV);
        const acsResult = await pool.request()
            .input('StartDate', sql.Date, startDate)
            .input('EndDate', sql.Date, endDate)
            .query(qACS);
        const totalAutomatonResult = await pool.request()
            .input('StartDate', sql.Date, startDate)
            .input('EndDate', sql.Date, endDate)
            .query(totalAutomaton);
        
        

        // Log the fetched data
        // console.log("Incident Data: ", incidentResult.recordset);
        // console.log("Intelligence Data: ", intelligenceResult.recordset);
        // console.log("Vigilance Data: ", vigilanceResult.recordset);
        // console.log("Security Data: ", securityResult.recordset);
        // console.log("Security Staff Data: ", securityStaffResult.recordset);
        // console.log("agency Security Staff Data: ", agencySecurityStaffResult.recordset);
        console.log("Security automation camera: ", cctvResult.recordset);
        console.log("Security automation ACS: ", acsResult.recordset);
        // console.log("Security automation TOTAL: ", totalAutomatonResult.recordset);

        // Merge and insert/update the data
        await insertOrUpdateDashboard(incidentResult.recordset, intelligenceResult.recordset, vigilanceResult.recordset, securityResult.recordset, securityStaffResult.recordset, agencySecurityStaffResult.recordset, cctvResult.recordset, acsResult.recordset, totalAutomatonResult.recordset ,  startDate);

        pool.close();
    } catch (err) {
        console.error("Error in fetching or inserting data:", err);
    }
}




// Function to insert or update data in OL_DASHBOARD_MONTHLY table

async function insertOrUpdateDashboard(incidentData, intelligenceData, vigilanceData, securityData, securityStaffData, agencySecurityStaffData, cctvResult, acsResult , totalAutomatonResult , startDate) {
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
                FROM [az01ismsproddbd01].[dbo].[OL_DASHBOARD_MONTHLY]
            `;
            const maxRowIdResult = await pool.request().query(maxRowIdQuery);
            const maxRowId = maxRowIdResult.recordset[0].MaxRowID || 0;  // If no rows, set ROWID to 0
            const newRowId = maxRowId + 1; // Increment ROWID by 1 for each iteration

            // Check for undefined or null data arrays and handle them
            const intelligenceRow = intelligenceData ? intelligenceData.find(item => item.SIID === siid) : null;
            const vigilanceRow = vigilanceData ? vigilanceData.find(item => item.SIID === siid) : null;
            const securityRow = securityData ? securityData.find(item => item.SIID === siid) : null;
            const securityStaffRow = securityStaffData ? securityStaffData.find(item => item.SIID === siid) : null;
            const agencySecurityRow = agencySecurityStaffData ? agencySecurityStaffData.find(item => item.SIID === siid) : null;
            const cctvRow = cctvResult ? cctvResult.find(item => item.SIID === siid) : null;
            const acsRow = acsResult ? acsResult.find(item => item.SIID === siid) : null;
            const totalAutomatonRow = totalAutomatonResult ? totalAutomatonResult.find(item => item.SIID === siid) : null;

          //  const acsRow = acsResult && acsResult.recordset ? acsResult.recordset.find(item => item.SIID === siid) : null;
            //const totalAutomatonRow = totalAutomatonResult && totalAutomatonResult.recordset ? totalAutomatonResult.recordset.find(item => item.SIID === siid) : null;

            // Get the values from the found rows (if not found, default to 0)
            const intelligenceCount = intelligenceRow ? intelligenceRow.INTELLIGENCECOUNT : 0;
            const vigilanceCount = vigilanceRow ? vigilanceRow.VIGILANCECOUNT : 0;
            const cctvSum = securityRow ? securityRow.CCTV_SUM : 0;
            const acsSum = securityRow ? securityRow.ACS_SUM : 0;
            const toolboxSum = securityRow ? securityRow.TOOLBOX_SUM : 0;
            const trainingSum = securityRow ? securityRow.TRAINING_SUM : 0;
            const mockDrillsSum = securityRow ? securityRow.SECURITYMOCKDRILLS_SUM : 0;
            const surpriseRoundSum = securityRow ? securityRow.SURPRISEROUND_SUM : 0;

            // New values for security staff data
            const secStaffReq = securityStaffRow ? securityStaffRow.SEC_STAFF_REQ : 0;
            const secStaffAvl = securityStaffRow ? securityStaffRow.SEC_STAFF_AVL : 0;
            const secStaffDef = securityStaffRow ? securityStaffRow.SEC_STAFF_DEF : 0;

            // New values for agency security data
            const agencySecStaffAuth = agencySecurityRow ? agencySecurityRow.AGENCYSEC_STAFF_AUTH : 0;
            const agencySecStaffAvl = agencySecurityRow ? agencySecurityRow.AGENCYSEC_STAFF_AVL : 0;
            const agencySecStaffDef = agencySecurityRow ? agencySecurityRow.AGENCYSEC_STAFF_DEF : 0;

            const cctvAvailable = cctvRow ? cctvRow.CAMERA_AVAILABLE : 0;
            const cctvWorking = cctvRow ? cctvRow.CAMERA_WORKING : 0;
            const cctvNotWorking = cctvRow ? cctvRow.CAMERA_NOT_WORKING : 0
            // console.log(cctvAvailable,"cctv available");
            // ACS-related values
            const acsAvailable = acsRow ? acsRow.ACS_AVAILABLE : 0;
            const acsWorking = acsRow ? acsRow.ACS_WORKING : 0;
            const acsNotWorking = acsRow ? acsRow.ACS_NOT_WORKING : 0;
            console.log(cctvAvailable,"cctv available" , acsAvailable,"acs available");

            // New values for total automaton
            const totalAvailable = totalAutomatonRow ? totalAutomatonRow.TOTAL_AVAILABLE : 0;
            const totalWorking = totalAutomatonRow ? totalAutomatonRow.TOTAL_WORKING : 0;
            const totalNotWorking = totalAutomatonRow ? totalAutomatonRow.TOTAL_NOT_WORKING : 0;

            // Check if the record exists in OL_DASHBOARD_MONTHLY
            const checkQuery = `
                SELECT COUNT(*) AS RecordCount
                FROM [az01ismsproddbd01].[dbo].[OL_DASHBOARD_MONTHLY]
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
                    UPDATE [az01ismsproddbd01].[dbo].[OL_DASHBOARD_MONTHLY]
                    SET 
                        [INCIDENTOPEN] = @INCIDENTOPEN,
                        [INCIDENTCLOSE] = @INCIDENTCLOSE,
                        [INCIDENTINFORMATION] = @INCIDENTINFORMATION,
                        [INCIDENTREPORTABLE] = @INCIDENTREPORTABLE,
                        [INTELLIGENCE] = @INTELLIGENCE,
                        [VIGILANCE] = @VIGILANCE,
                        [CCTV] = @CCTV,
                        [ACS] = @ACS,
                        [TOOLBOXTALK] = @TOOLBOXTALK,
                        [TRAINING] = @TRAINING,
                        [MOCKDRILL] = @MOCKDRILL,
                        [SURPRISECHECK] = @SURPRISECHECK,
                        [SEC_STAFF_REQ] = @SEC_STAFF_REQ,
                        [SEC_STAFF_AVL] = @SEC_STAFF_AVL,
                        [SEC_STAFF_DEF] = @SEC_STAFF_DEF,
                        [AGENCY_AUTH] = @AGENCY_AUTH,
                        [AGENCY_AVL] = @AGENCY_AVL,
                        [AGENCY_DEF] = @AGENCY_DEF,
                        [SEC_AUTO_CCTV_AVAILABLE] = @SEC_AUTO_CCTV_AVAILABLE,
                        [SEC_AUTO_CCTV_WORKING] = @SEC_AUTO_CCTV_WORKING,
                        [SEC_AUTO_CCTV_NOTWORKING] = @SEC_AUTO_CCTV_NOTWORKING ,
                        [SEC_AUTO_ACS_AVAILABLE] = @SEC_AUTO_ACS_AVAILABLE,
                        [SEC_AUTO_ACS_WORKING] = @SEC_AUTO_ACS_WORKING,
                        [SEC_AUTO_ACS_NOTWORKING] = @SEC_AUTO_ACS_NOTWORKING,
                        [SEC_AUTO_TOTAL_AVAILABLE] = @SEC_AUTO_TOTAL_AVAILABLE,
                        [SEC_AUTO_TOTAL_WORKING] = @SEC_AUTO_TOTAL_WORKING,
                        [SEC_AUTO_TOTAL_NOTWORKING] = @SEC_AUTO_TOTAL_NOTWORKING
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
                    .input('INTELLIGENCE', sql.Int, intelligenceCount)
                    .input('VIGILANCE', sql.Int, vigilanceCount)
                    .input('CCTV', sql.Int, cctvSum)
                    .input('ACS', sql.Int, acsSum)
                    .input('TOOLBOXTALK', sql.Int, toolboxSum)
                    .input('TRAINING', sql.Int, trainingSum)
                    .input('MOCKDRILL', sql.Int, mockDrillsSum)
                    .input('SURPRISECHECK', sql.Int, surpriseRoundSum)
                    .input('SEC_STAFF_REQ', sql.Int, secStaffReq)
                    .input('SEC_STAFF_AVL', sql.Int, secStaffAvl)
                    .input('SEC_STAFF_DEF', sql.Int, secStaffDef)
                    .input('AGENCY_AUTH', sql.Int, agencySecStaffAuth)
                    .input('AGENCY_AVL', sql.Int, agencySecStaffAvl)
                    .input('AGENCY_DEF', sql.Int, agencySecStaffDef)
                    .input('SEC_AUTO_CCTV_AVAILABLE', sql.Int, cctvAvailable)
                    .input('SEC_AUTO_CCTV_WORKING', sql.Int, cctvWorking)
                    .input('SEC_AUTO_CCTV_NOTWORKING', sql.Int, cctvNotWorking)
                    .input('SEC_AUTO_ACS_AVAILABLE', sql.Int, acsAvailable)
                    .input('SEC_AUTO_ACS_WORKING', sql.Int, acsWorking)
                    .input('SEC_AUTO_ACS_NOTWORKING', sql.Int, acsNotWorking)
                    .input('SEC_AUTO_TOTAL_AVAILABLE', sql.Int, totalAvailable)
                    .input('SEC_AUTO_TOTAL_WORKING', sql.Int, totalWorking)
                    .input('SEC_AUTO_TOTAL_NOTWORKING', sql.Int, totalNotWorking)
                    .query(updateQuery);

                updateCount++;  // Increment update counter
            } else {
                  // Insert new record
                  const insertQuery = `
                  INSERT INTO [az01ismsproddbd01].[dbo].[OL_DASHBOARD_MONTHLY]
                  ([ROWID], [VNAME], [BUNAME], [SINAME], [VCODE], [BUCODE], [SICODE], [YEAR], [MONTH], [QUARTER], [MONTHNAME], 
                   [INCIDENTOPEN], [INCIDENTCLOSE], [INCIDENTINFORMATION], [INCIDENTREPORTABLE],
                   [INTELLIGENCE], [VIGILANCE], [CCTV], [ACS], [TOOLBOXTALK], [TRAINING], 
                   [MOCKDRILL], [SURPRISECHECK], [SIID], [VID], [BUID], [SEC_STAFF_REQ], [SEC_STAFF_AVL], [SEC_STAFF_DEF],
                   [AGENCY_AUTH], [AGENCY_AVL], [AGENCY_DEF] , [SEC_AUTO_CCTV_AVAILABLE], [SEC_AUTO_CCTV_WORKING], [SEC_AUTO_CCTV_NOTWORKING], [SEC_AUTO_ACS_AVAILABLE],
                   [SEC_AUTO_ACS_WORKING],[SEC_AUTO_ACS_NOTWORKING],[SEC_AUTO_TOTAL_AVAILABLE], [SEC_AUTO_TOTAL_WORKING], [SEC_AUTO_TOTAL_NOTWORKING])
                  VALUES 
                  (@ROWID, @VNAME, @BUNAME, @SINAME, @VCODE, @BUCODE, @SICODE, 
                   @YEAR, @MONTH, @QUARTER, @MONTHNAME, 
                   @INCIDENTOPEN, @INCIDENTCLOSE, @INCIDENTINFORMATION, @INCIDENTREPORTABLE, 
                   @INTELLIGENCE, @VIGILANCE, @CCTV, @ACS, @TOOLBOXTALK, @TRAINING, 
                   @MOCKDRILL, @SURPRISECHECK, @SIID, @VID, @BUID, @SEC_STAFF_REQ, @SEC_STAFF_AVL, @SEC_STAFF_DEF,
                   @AGENCY_AUTH, @AGENCY_AVL, @AGENCY_DEF , @SEC_AUTO_CCTV_AVAILABLE, @SEC_AUTO_CCTV_WORKING, @SEC_AUTO_CCTV_NOTWORKING ,  @SEC_AUTO_ACS_AVAILABLE,
                   @SEC_AUTO_ACS_WORKING, @SEC_AUTO_ACS_NOTWORKING ,  @SEC_AUTO_TOTAL_AVAILABLE, @SEC_AUTO_TOTAL_WORKING, @SEC_AUTO_TOTAL_NOTWORKING);
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
                  .input('INTELLIGENCE', sql.Int, intelligenceCount)
                  .input('VIGILANCE', sql.Int, vigilanceCount)
                  .input('CCTV', sql.Int, cctvSum)
                  .input('ACS', sql.Int, acsSum)
                  .input('TOOLBOXTALK', sql.Int, toolboxSum)
                  .input('TRAINING', sql.Int, trainingSum)
                  .input('MOCKDRILL', sql.Int, mockDrillsSum)
                  .input('SURPRISECHECK', sql.Int, surpriseRoundSum)
                  .input('SIID', sql.Int, siid)
                  .input('VID', sql.Int, vid)
                  .input('BUID', sql.Int, buid)
                  .input('SEC_STAFF_REQ', sql.Int, secStaffReq)
                  .input('SEC_STAFF_AVL', sql.Int, secStaffAvl)
                  .input('SEC_STAFF_DEF', sql.Int, secStaffDef)
                  .input('AGENCY_AUTH', sql.Int, agencySecStaffAuth)
                  .input('AGENCY_AVL', sql.Int, agencySecStaffAvl)
                  .input('AGENCY_DEF', sql.Int, agencySecStaffDef)
                  .input('SEC_AUTO_CCTV_AVAILABLE', sql.Int, cctvAvailable)
                  .input('SEC_AUTO_CCTV_WORKING', sql.Int, cctvWorking)
                  .input('SEC_AUTO_CCTV_NOTWORKING', sql.Int, cctvNotWorking)
                  .input('SEC_AUTO_ACS_AVAILABLE', sql.Int, acsAvailable)
                  .input('SEC_AUTO_ACS_WORKING', sql.Int, acsWorking)
                  .input('SEC_AUTO_ACS_NOTWORKING', sql.Int, acsNotWorking)
                   .input('SEC_AUTO_TOTAL_AVAILABLE', sql.Int, totalAvailable)
                  .input('SEC_AUTO_TOTAL_WORKING', sql.Int, totalWorking)
                  .input('SEC_AUTO_TOTAL_NOTWORKING', sql.Int, totalNotWorking)
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
   
