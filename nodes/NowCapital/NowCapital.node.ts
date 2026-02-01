import {
    IExecuteFunctions,
    INodeExecutionData,
    INodeType,
    INodeTypeDescription,
    NodeOperationError,
} from 'n8n-workflow';

interface CalculationPayload {
    person1_ui: Record<string, unknown>;
    person2_ui: Record<string, unknown>;
    inputs: {
        expected_returns: number;
        cpi: number;
        [key: string]: unknown;
    };
    withdrawal_strategy: Record<string, unknown>;
    target_monthly_spend?: number;
}

// Helper function to build the base API payload (mirrors the working MCP server logic)
// Helper function to build the base API payload (mirrors the working MCP server logic)
function constructPayload(context: IExecuteFunctions, itemIndex: number): CalculationPayload {
    const scenarioType = context.getNodeParameter('scenarioType', itemIndex) as string;
    const isIndividual = scenarioType === 'individual';

    // Helper to get collection parameters safely
    const getCollection = (paramName: string) => context.getNodeParameter(paramName, itemIndex, {}) as Record<string, unknown>;

    // Common Inputs
    const expectedReturns = context.getNodeParameter('expectedReturns', itemIndex) as number;
    const cpi = context.getNodeParameter('cpi', itemIndex) as number;
    const province = context.getNodeParameter('province', itemIndex) as string;

    // Global Settings
    const globalSettings = getCollection('globalSettings');

    // Person 1 Data
    const p1Adv = getCollection('p1AdvancedOptions');
    const p1Db = getCollection('p1DbPension');
    const p1NonReg = context.getNodeParameter('p1NonRegistered', itemIndex) as number || 0;
    const p1NonRegAcb = context.getNodeParameter('p1NonRegAcb', itemIndex) as number || 0;
    // Calc default cost basis if 0 provided (using P1's specific growth assumption, defaulting to 90%)
    const p1DefaultCostBasisPct = (p1Adv.nonRegGrowthCapGains as number || 90) / 100;
    const p1CostBasis = p1NonRegAcb !== 0 ? p1NonRegAcb : (p1NonReg * p1DefaultCostBasisPct);

    // Person 2 Data (or defaults if individual)
    const p2Adv = isIndividual ? {} : getCollection('p2AdvancedOptions');
    const p2Db = isIndividual ? {} : getCollection('p2DbPension');
    const p2NonReg = isIndividual ? 0 : (context.getNodeParameter('p2NonRegistered', itemIndex) as number || 0);
    const p2NonRegAcb = isIndividual ? 0 : (context.getNodeParameter('p2NonRegAcb', itemIndex) as number || 0);
    const p2DefaultCostBasisPct = (p2Adv.nonRegGrowthCapGains as number || 90) / 100;
    const p2CostBasis = p2NonRegAcb !== 0 ? p2NonRegAcb : (p2NonReg * p2DefaultCostBasisPct);

    // Helper to extract Withdrawal Order from Fixed Collection
    const getWithdrawalOrder = (paramName: string) => {
        const raw = context.getNodeParameter(paramName, itemIndex, {}) as { order?: { first: string; second: string; third: string } };
        if (raw.order) {
            return [raw.order.first, raw.order.second, raw.order.third];
        }
        return ['rrsp', 'non_registered', 'tfsa']; // Default fallback
    };

    return {
        person1_ui: {
            name: context.getNodeParameter('p1Name', itemIndex) as string,
            current_age: context.getNodeParameter('p1CurrentAge', itemIndex) as number,
            retirement_age: context.getNodeParameter('p1RetirementAge', itemIndex) as number,
            death_age: context.getNodeParameter('p1DeathAge', itemIndex) as number,
            province: province,
            rrsp: context.getNodeParameter('p1Rrsp', itemIndex) as number,
            tfsa: context.getNodeParameter('p1Tfsa', itemIndex) as number,
            non_registered: p1NonReg,
            lira: p1Adv.lira || 0,
            cost_basis: p1CostBasis,
            rrsp_contribution_room: p1Adv.rrspContributionRoom || 0,
            tfsa_contribution_room: p1Adv.tfsaContributionRoom || 0,
            cpp_start_age: p1Adv.cppStartAge || 65,
            oas_start_age: p1Adv.oasStartAge || 65,
            base_cpp_amount: p1Adv.baseCppAmount || 17196,
            base_oas_amount: p1Adv.baseOasAmount || 8876,
            rrsp_contribution: p1Adv.rrspContribution || 0,
            tfsa_contribution: p1Adv.tfsaContribution || 0,
            non_registered_contribution: p1Adv.nonRegisteredContribution || 0,
            // DB Pension P1
            db_enabled: p1Db.enabled || false,
            db_pension_income: p1Db.income || 0,
            db_start_age: p1Db.startAge || 65,
            db_index_before_retirement: p1Db.indexBefore !== undefined ? p1Db.indexBefore : true,
            db_index_after_retirement: p1Db.indexAfter || 0,
            db_index_after_retirement_to_cpi: p1Db.indexAfterToCpi || false,
            db_cpp_clawback_fraction: p1Db.cppClawbackFraction || 0,
            db_survivor_benefit_percentage: p1Db.survivorBenefit || 60,
            pension_plan_type: 'Generic',
            has_10_year_guarantee: p1Db.hasGuarantee || false,
            // Assumptions P1 (Individualized)
            non_registered_growth_capital_gains_pct: p1Adv.nonRegGrowthCapGains || 90,
            non_registered_dividend_yield_pct: p1Adv.nonRegDivYield || 2.0,
            non_registered_eligible_dividend_proportion_pct: p1Adv.nonRegEligDiv || 70,
            lif_conversion_age: p1Adv.lifAge || 71,
            rrif_conversion_age: p1Adv.rrifAge || 71,
            enable_rrsp_meltdown: p1Adv.meltdown || false,
        },
        person2_ui: {
            name: isIndividual ? 'Person 2' : context.getNodeParameter('p2Name', itemIndex) as string,
            current_age: isIndividual ? 60 : context.getNodeParameter('p2CurrentAge', itemIndex) as number,
            retirement_age: isIndividual ? 65 : context.getNodeParameter('p2RetirementAge', itemIndex) as number,
            death_age: isIndividual ? 92 : context.getNodeParameter('p2DeathAge', itemIndex) as number,
            rrsp: isIndividual ? 0 : context.getNodeParameter('p2Rrsp', itemIndex) as number,
            tfsa: isIndividual ? 0 : context.getNodeParameter('p2Tfsa', itemIndex) as number,
            non_registered: p2NonReg,
            lira: p2Adv.lira || 0,
            cost_basis: p2CostBasis,
            rrsp_contribution_room: p2Adv.rrspContributionRoom || 0,
            tfsa_contribution_room: p2Adv.tfsaContributionRoom || 0,
            cpp_start_age: p2Adv.cppStartAge || 65,
            oas_start_age: p2Adv.oasStartAge || 65,
            base_cpp_amount: p2Adv.baseCppAmount || 17196,
            base_oas_amount: p2Adv.baseOasAmount || 8876,
            rrsp_contribution: p2Adv.rrspContribution || 0,
            tfsa_contribution: p2Adv.tfsaContribution || 0,
            non_registered_contribution: p2Adv.nonRegisteredContribution || 0,
            // DB Pension P2
            db_enabled: p2Db.enabled || false,
            db_pension_income: p2Db.income || 0,
            db_start_age: p2Db.startAge || 65,
            db_index_before_retirement: p2Db.indexBefore !== undefined ? p2Db.indexBefore : true,
            db_index_after_retirement: p2Db.indexAfter || 0,
            db_index_after_retirement_to_cpi: p2Db.indexAfterToCpi || false,
            db_cpp_clawback_fraction: p2Db.cppClawbackFraction || 0,
            db_survivor_benefit_percentage: p2Db.survivorBenefit || 60,
            pension_plan_type: 'Generic',
            has_10_year_guarantee: p2Db.hasGuarantee || false,
            // Assumptions P2 (Individualized)
            non_registered_growth_capital_gains_pct: p2Adv.nonRegGrowthCapGains || 90,
            non_registered_dividend_yield_pct: p2Adv.nonRegDivYield || 2.0,
            non_registered_eligible_dividend_proportion_pct: p2Adv.nonRegEligDiv || 70,
            lif_conversion_age: p2Adv.lifAge || 71,
            rrif_conversion_age: p2Adv.rrifAge || 71,
            enable_rrsp_meltdown: p2Adv.meltdown || false,
        },
        inputs: {
            expected_returns: expectedReturns,
            cpi: cpi,
            province: province,
            individual: isIndividual,
            income_split: globalSettings.incomeSplit !== undefined ? globalSettings.incomeSplit : false,
            allocation: globalSettings.allocation || 50,
            survivor_expense_percent: globalSettings.survivorExpensePercent || 80,
            base_tfsa_amount: globalSettings.baseTfsa || 7000,
            calculate_gis: globalSettings.calculateGis || false,
            // Hardcoded Monte Carlo Defaults (FP Canada Baseline)
            return_std_dev: 0.09,
            cpi_std_dev: 0.012,
            return_cpi_correlation: -0.05,
            num_trials: 1000,
            distribution_model: 'lognormal',
        },
        withdrawal_strategy: {
            person1: { weights: [{ type: 'fallback', order: getWithdrawalOrder('p1WithdrawalStrategy') }] },
            person2: { weights: [{ type: 'fallback', order: getWithdrawalOrder('p2WithdrawalStrategy') }] },
        },
    };
}

export class NowCapital implements INodeType {
    description: INodeTypeDescription = {
        // ... (omitting strict repetition of properties top matter)
        displayName: 'NowCapital',
        name: 'nowCapital',
        icon: 'file:nowcapital.svg',
        group: ['transform'],
        version: 1,
        subtitle: '={{$parameter["operation"]}}',
        description: 'Advanced Canadian Retirement Planning & Monte Carlo Simulations',
        defaults: { name: 'NowCapital' },
        inputs: ['main'],
        outputs: ['main'],
        credentials: [{ name: 'nowCapitalApi', required: true }],
        properties: [
            // ... (keeping existing standard properties)
            {
                displayName: 'Resource',
                name: 'resource',
                type: 'options',
                noDataExpression: true,
                options: [
                    { name: 'Plan', value: 'plan' },
                ],
                default: 'plan',
            },
            {
                displayName: 'Operation',
                name: 'operation',
                type: 'options',
                noDataExpression: true,
                displayOptions: { show: { resource: ['plan'] } },
                options: [
                    { name: 'Calculate Specific Spend', value: 'calculateWithTargetSpend', action: 'Calculate with target spending' },
                    { name: 'Calculate Sustainable Spend', value: 'calculateMaxSpend', action: 'Calculate sustainable monthly spending' },
                    { name: 'Get Detailed Projections', value: 'calculateMaxSpendWithYearlyData', action: 'Get detailed yearly projections' },
                    { name: 'Get Simulation Result', value: 'getSimulationResult', action: 'Get simulation result' },
                    { name: 'Get Simulation Status', value: 'getSimulationStatus', action: 'Get simulation status' },
                    { name: 'Run Monte Carlo Simulation', value: 'monteCarlo', action: 'Start monte carlo simulation' },
                ],
                default: 'calculateMaxSpend',
            },
            {
                displayName: 'Target Monthly Spend',
                name: 'targetMonthlySpend',
                type: 'number',
                default: 5000,
                required: true,
                displayOptions: { show: { resource: ['plan'], operation: ['calculateWithTargetSpend', 'monteCarlo'] } },
                description: 'Amount of money to spend monthly after-tax',
            },
            {
                displayName: 'Scenario Type',
                name: 'scenarioType',
                type: 'options',
                options: [
                    { name: 'Individual', value: 'individual' },
                    { name: 'Couple', value: 'couple' },
                ],
                default: 'individual',
                displayOptions: { show: { resource: ['plan'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
            },
            {
                displayName: 'Person 1 - Name',
                name: 'p1Name',
                type: 'string',
                default: 'User 1',
                displayOptions: { show: { resource: ['plan'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
            },
            {
                displayName: 'Person 1 - Current Age',
                name: 'p1CurrentAge',
                type: 'number',
                default: 60,
                displayOptions: { show: { resource: ['plan'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
            },
            {
                displayName: 'Person 1 - Retirement Age',
                name: 'p1RetirementAge',
                type: 'number',
                default: 65,
                displayOptions: { show: { resource: ['plan'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
            },
            {
                displayName: 'Person 1 - Death Age',
                name: 'p1DeathAge',
                type: 'number',
                default: 92,
                displayOptions: { show: { resource: ['plan'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
            },
            {
                displayName: 'Person 1 - RRSP Balance',
                name: 'p1Rrsp',
                type: 'number',
                default: 500000,
                displayOptions: { show: { resource: ['plan'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
            },
            {
                displayName: 'Person 1 - TFSA Balance',
                name: 'p1Tfsa',
                type: 'number',
                default: 100000,
                displayOptions: { show: { resource: ['plan'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
            },
            {
                displayName: 'Person 1 - Non-Registered Balance',
                name: 'p1NonRegistered',
                type: 'number',
                default: 0,
                displayOptions: { show: { resource: ['plan'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
            },
            {
                displayName: 'Person 1 - Non-Registered Cost Basis (ACB)',
                name: 'p1NonRegAcb',
                type: 'number',
                default: 0,
                description: 'Leave 0 to use default (90% of balance)',
                displayOptions: { show: { resource: ['plan'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
            },
            {
                displayName: 'Person 2 - Name',
                name: 'p2Name',
                type: 'string',
                default: 'User 2',
                displayOptions: { show: { resource: ['plan'], scenarioType: ['couple'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
            },
            {
                displayName: 'Person 2 - Current Age',
                name: 'p2CurrentAge',
                type: 'number',
                default: 60,
                displayOptions: { show: { resource: ['plan'], scenarioType: ['couple'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
            },
            {
                displayName: 'Person 2 - Retirement Age',
                name: 'p2RetirementAge',
                type: 'number',
                default: 65,
                displayOptions: { show: { resource: ['plan'], scenarioType: ['couple'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
            },
            {
                displayName: 'Person 2 - Death Age',
                name: 'p2DeathAge',
                type: 'number',
                default: 92,
                displayOptions: { show: { resource: ['plan'], scenarioType: ['couple'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
            },
            {
                displayName: 'Person 2 - RRSP Balance',
                name: 'p2Rrsp',
                type: 'number',
                default: 0,
                displayOptions: { show: { resource: ['plan'], scenarioType: ['couple'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
            },
            {
                displayName: 'Person 2 - TFSA Balance',
                name: 'p2Tfsa',
                type: 'number',
                default: 0,
                displayOptions: { show: { resource: ['plan'], scenarioType: ['couple'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
            },
            {
                displayName: 'Person 2 - Non-Registered Balance',
                name: 'p2NonRegistered',
                type: 'number',
                default: 0,
                displayOptions: { show: { resource: ['plan'], scenarioType: ['couple'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
            },
            {
                displayName: 'Person 2 - Non-Registered Cost Basis (ACB)',
                name: 'p2NonRegAcb',
                type: 'number',
                default: 0,
                description: 'Leave 0 to use default (90% of balance)',
                displayOptions: { show: { resource: ['plan'], scenarioType: ['couple'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
            },
            {
                displayName: 'Province',
                name: 'province',
                type: 'options',
                options: [{ name: 'Ontario', value: 'ON' }, { name: 'BC', value: 'BC' }, { name: 'Alberta', value: 'AB' }, { name: 'Quebec', value: 'QC' }],
                default: 'ON',
                displayOptions: { show: { resource: ['plan'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
            },
            {
                displayName: 'Expected Returns (%)',
                name: 'expectedReturns',
                type: 'number',
                default: 4.5,
                displayOptions: { show: { resource: ['plan'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
            },
            {
                displayName: 'Inflation Rate (%)',
                name: 'cpi',
                type: 'number',
                default: 2.3,
                displayOptions: { show: { resource: ['plan'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
            },
            {
                displayName: 'Job ID',
                name: 'jobId',
                type: 'string',
                default: '',
                required: true,
                displayOptions: { show: { resource: ['plan'], operation: ['getSimulationStatus', 'getSimulationResult'] } },
            },

            // --- Advanced Options: Person 1 ---
            {
                displayName: 'Person 1 - Advanced Options',
                name: 'p1AdvancedOptions',
                type: 'collection',
                placeholder: 'Add Option',
                default: {},
                displayOptions: { show: { resource: ['plan'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
                options: [
                    { displayName: 'Annual Non-Reg Contrib', name: 'nonRegisteredContribution', type: 'number', default: 0 },
                    { displayName: 'Annual RRSP Contrib', name: 'rrspContribution', type: 'number', default: 0 },
                    { displayName: 'Annual TFSA Contrib', name: 'tfsaContribution', type: 'number', default: 0 },
                    { displayName: 'Base CPP Amount', name: 'baseCppAmount', type: 'number', default: 17196 },
                    { displayName: 'Base OAS Amount', name: 'baseOasAmount', type: 'number', default: 8876 },
                    { displayName: 'CPP Start Age', name: 'cppStartAge', type: 'number', default: 65 },
                    { displayName: 'Enable RRSP Meltdown', name: 'meltdown', type: 'boolean', default: false },
                    { displayName: 'LIF Conversion Age', name: 'lifAge', type: 'number', default: 71 },
                    { displayName: 'LIRA Balance', name: 'lira', type: 'number', default: 0 },
                    { displayName: 'Non-Reg Dividend Yield %', name: 'nonRegDivYield', type: 'number', default: 2.0 },
                    { displayName: 'Non-Reg Eligible Div %', name: 'nonRegEligDiv', type: 'number', default: 70 },
                    { displayName: 'Non-Reg Growth Capital Gains %', name: 'nonRegGrowthCapGains', type: 'number', default: 90 },
                    { displayName: 'OAS Start Age', name: 'oasStartAge', type: 'number', default: 65 },
                    { displayName: 'RRIF Conversion Age', name: 'rrifAge', type: 'number', default: 71 },
                    { displayName: 'RRSP Contribution Room', name: 'rrspContributionRoom', type: 'number', default: 0 },
                    { displayName: 'TFSA Contribution Room', name: 'tfsaContributionRoom', type: 'number', default: 0 },
                ],
            },

            // --- Advanced Options: Person 2 (Couple Only) ---
            {
                displayName: 'Person 2 - Advanced Options',
                name: 'p2AdvancedOptions',
                type: 'collection',
                placeholder: 'Add Option',
                default: {},
                displayOptions: { show: { resource: ['plan'], scenarioType: ['couple'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
                options: [
                    { displayName: 'Annual Non-Reg Contrib', name: 'nonRegisteredContribution', type: 'number', default: 0 },
                    { displayName: 'Annual RRSP Contrib', name: 'rrspContribution', type: 'number', default: 0 },
                    { displayName: 'Annual TFSA Contrib', name: 'tfsaContribution', type: 'number', default: 0 },
                    { displayName: 'Base CPP Amount', name: 'baseCppAmount', type: 'number', default: 17196 },
                    { displayName: 'Base OAS Amount', name: 'baseOasAmount', type: 'number', default: 8876 },
                    { displayName: 'CPP Start Age', name: 'cppStartAge', type: 'number', default: 65 },
                    { displayName: 'Enable RRSP Meltdown', name: 'meltdown', type: 'boolean', default: false },
                    { displayName: 'LIF Conversion Age', name: 'lifAge', type: 'number', default: 71 },
                    { displayName: 'LIRA Balance', name: 'lira', type: 'number', default: 0 },
                    { displayName: 'Non-Reg Dividend Yield %', name: 'nonRegDivYield', type: 'number', default: 2.0 },
                    { displayName: 'Non-Reg Eligible Div %', name: 'nonRegEligDiv', type: 'number', default: 70 },
                    { displayName: 'Non-Reg Growth Capital Gains %', name: 'nonRegGrowthCapGains', type: 'number', default: 90 },
                    { displayName: 'OAS Start Age', name: 'oasStartAge', type: 'number', default: 65 },
                    { displayName: 'RRIF Conversion Age', name: 'rrifAge', type: 'number', default: 71 },
                    { displayName: 'RRSP Contribution Room', name: 'rrspContributionRoom', type: 'number', default: 0 },
                    { displayName: 'TFSA Contribution Room', name: 'tfsaContributionRoom', type: 'number', default: 0 },
                ],
            },

            // --- DB Pension Details: Person 1 ---
            {
                displayName: 'Person 1 - DB Pension',
                name: 'p1DbPension',
                type: 'collection',
                placeholder: 'Add DB Details',
                default: {},
                displayOptions: { show: { resource: ['plan'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
                options: [
                    { displayName: 'Annual Income', name: 'income', type: 'number', default: 0 },
                    { displayName: 'CPP Clawback Fraction', name: 'cppClawbackFraction', type: 'number', default: 0, description: '0 to 1' },
                    { displayName: 'Enable DB Pension', name: 'enabled', type: 'boolean', default: false },
                    { displayName: 'Guarantee Period (10yr)', name: 'hasGuarantee', type: 'boolean', default: false },
                    { displayName: 'Has Bridge Benefit', name: 'hasBridge', type: 'boolean', default: false },
                    { displayName: 'Index After Retirement %', name: 'indexAfter', type: 'number', default: 0 },
                    { displayName: 'Index After Retirement to CPI', name: 'indexAfterToCpi', type: 'boolean', default: false },
                    { displayName: 'Index Before Retirement', name: 'indexBefore', type: 'boolean', default: true },
                    { displayName: 'Is Survivor Pension?', name: 'isSurvivor', type: 'boolean', default: false },
                    { displayName: 'Start Age', name: 'startAge', type: 'number', default: 65 },
                    { displayName: 'Survivor Benefit %', name: 'survivorBenefit', type: 'number', default: 60 },
                ],
            },

            // --- DB Pension Details: Person 2 (Couple Only) ---
            {
                displayName: 'Person 2 - DB Pension',
                name: 'p2DbPension',
                type: 'collection',
                placeholder: 'Add DB Details',
                default: {},
                displayOptions: { show: { resource: ['plan'], scenarioType: ['couple'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
                options: [
                    { displayName: 'Annual Income', name: 'income', type: 'number', default: 0 },
                    { displayName: 'CPP Clawback Fraction', name: 'cppClawbackFraction', type: 'number', default: 0, description: '0 to 1' },
                    { displayName: 'Enable DB Pension', name: 'enabled', type: 'boolean', default: false },
                    { displayName: 'Guarantee Period (10yr)', name: 'hasGuarantee', type: 'boolean', default: false },
                    { displayName: 'Has Bridge Benefit', name: 'hasBridge', type: 'boolean', default: false },
                    { displayName: 'Index After Retirement %', name: 'indexAfter', type: 'number', default: 0 },
                    { displayName: 'Index After Retirement to CPI', name: 'indexAfterToCpi', type: 'boolean', default: false },
                    { displayName: 'Index Before Retirement', name: 'indexBefore', type: 'boolean', default: true },
                    { displayName: 'Is Survivor Pension?', name: 'isSurvivor', type: 'boolean', default: false },
                    { displayName: 'Start Age', name: 'startAge', type: 'number', default: 65 },
                    { displayName: 'Survivor Benefit %', name: 'survivorBenefit', type: 'number', default: 60 },
                ],
            },

            // --- Global/Investment Assumptions ---
            {
                displayName: 'Global Settings',
                name: 'globalSettings',
                type: 'collection',
                placeholder: 'Assumptions & Settings',
                default: {},
                displayOptions: { show: { resource: ['plan'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
                options: [
                    { displayName: 'Base TFSA Room', name: 'baseTfsa', type: 'number', default: 7000 },
                    { displayName: 'Calculate GIS', name: 'calculateGis', type: 'boolean', default: false },
                    { displayName: 'Expense Allocation %', name: 'allocation', type: 'number', default: 50, description: 'Split of expenses between spouses' },
                    { displayName: 'Income Splitting', name: 'incomeSplit', type: 'boolean', default: false },
                    { displayName: 'Survivor Expense %', name: 'survivorExpensePercent', type: 'number', default: 80 },
                ],
            },
            // --- Withdrawal Strategy: Person 1 ---
            {
                displayName: 'Person 1 - Withdrawal Order',
                name: 'p1WithdrawalStrategy',
                type: 'fixedCollection',
                typeOptions: { multipleValues: false },
                default: {},
                placeholder: 'Custom Order',
                displayOptions: { show: { resource: ['plan'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
                options: [
                    {
                        displayName: 'Order',
                        name: 'order',
                        values: [
                            {
                                displayName: 'First Account',
                                name: 'first',
                                type: 'options',
                                options: [
                                    { name: 'RRSP / RRIF', value: 'rrsp' },
                                    { name: 'TFSA', value: 'tfsa' },
                                    { name: 'Non-Registered', value: 'non_registered' },
                                ],
                                default: 'rrsp',
                            },
                            {
                                displayName: 'Second Account',
                                name: 'second',
                                type: 'options',
                                options: [
                                    { name: 'RRSP / RRIF', value: 'rrsp' },
                                    { name: 'TFSA', value: 'tfsa' },
                                    { name: 'Non-Registered', value: 'non_registered' },
                                ],
                                default: 'non_registered',
                            },
                            {
                                displayName: 'Third Account',
                                name: 'third',
                                type: 'options',
                                options: [
                                    { name: 'RRSP / RRIF', value: 'rrsp' },
                                    { name: 'TFSA', value: 'tfsa' },
                                    { name: 'Non-Registered', value: 'non_registered' },
                                ],
                                default: 'tfsa',
                            },
                        ],
                    },
                ],
            },

            // --- Withdrawal Strategy: Person 2 (Couple Only) ---
            {
                displayName: 'Person 2 - Withdrawal Order',
                name: 'p2WithdrawalStrategy',
                type: 'fixedCollection',
                typeOptions: { multipleValues: false },
                default: {},
                placeholder: 'Custom Order',
                displayOptions: { show: { resource: ['plan'], scenarioType: ['couple'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
                options: [
                    {
                        displayName: 'Order',
                        name: 'order',
                        values: [
                            {
                                displayName: 'First Account',
                                name: 'first',
                                type: 'options',
                                options: [
                                    { name: 'RRSP / RRIF', value: 'rrsp' },
                                    { name: 'TFSA', value: 'tfsa' },
                                    { name: 'Non-Registered', value: 'non_registered' },
                                ],
                                default: 'rrsp',
                            },
                            {
                                displayName: 'Second Account',
                                name: 'second',
                                type: 'options',
                                options: [
                                    { name: 'RRSP / RRIF', value: 'rrsp' },
                                    { name: 'TFSA', value: 'tfsa' },
                                    { name: 'Non-Registered', value: 'non_registered' },
                                ],
                                default: 'non_registered',
                            },
                            {
                                displayName: 'Third Account',
                                name: 'third',
                                type: 'options',
                                options: [
                                    { name: 'RRSP / RRIF', value: 'rrsp' },
                                    { name: 'TFSA', value: 'tfsa' },
                                    { name: 'Non-Registered', value: 'non_registered' },
                                ],
                                default: 'tfsa',
                            },
                        ],
                    },
                ],
            },
        ],
        usableAsTool: true,
    };

    async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
        const items = this.getInputData();
        const returnData: INodeExecutionData[] = [];
        const credentials = await this.getCredentials('nowCapitalApi');
        const baseUrl = (credentials.baseUrl as string || 'https://api.nowcapital.ca').replace(/\/$/, '');

        for (let i = 0; i < items.length; i++) {
            try {
                const operation = this.getNodeParameter('operation', i) as string;
                let response;
                if (operation === 'getSimulationStatus' || operation === 'getSimulationResult') {
                    const jobId = this.getNodeParameter('jobId', i) as string;

                    // 1. Check status of the current ID
                    const statusResponse = await this.helpers.httpRequest({
                        method: 'GET',
                        url: `${baseUrl}/simulations/status/${jobId}`,
                        headers: { 'x-api-key': credentials.apiKey as string },
                        json: true,
                    });

                    // 2. If Success, check if it's a handover to an orchestrator
                    if (statusResponse.status === 'SUCCESS') {
                        const resultResponse = await this.helpers.httpRequest({
                            method: 'GET',
                            url: `${baseUrl}/simulations/result/${jobId}`,
                            headers: { 'x-api-key': credentials.apiKey as string },
                            json: true,
                        });

                        // Check for the "Orchestrator started" pattern (Backend handover)
                        if (resultResponse && resultResponse.status === 'Orchestrator started' && resultResponse.result_id) {
                            const subId = resultResponse.result_id;
                            // The user's original task is "Success" (handed off), but the simulation is still running.
                            // We poll the SUB-ID to give the user the REAL status of their plan.
                            if (operation === 'getSimulationStatus') {
                                response = await this.helpers.httpRequest({
                                    method: 'GET',
                                    url: `${baseUrl}/simulations/status/${subId}`,
                                    headers: { 'x-api-key': credentials.apiKey as string },
                                    json: true,
                                });
                                // Keep the original IDs for reference
                                response.original_task_id = jobId;
                                response.sub_task_id = subId;
                            } else {
                                // Get Result: Fetch the ACTUAL math results from the sub-task
                                response = await this.helpers.httpRequest({
                                    method: 'GET',
                                    url: `${baseUrl}/simulations/result/${subId}`,
                                    headers: { 'x-api-key': credentials.apiKey as string },
                                    json: true,
                                });
                                response.original_task_id = jobId;
                                response.sub_task_id = subId;
                            }
                        } else {
                            // No handover, this is the final final result
                            response = operation === 'getSimulationStatus' ? statusResponse : resultResponse;
                        }
                    } else {
                        // Still PENDING or FAILURE
                        response = statusResponse;
                    }
                } else {
                    const payload = constructPayload(this, i);

                    if (operation === 'monteCarlo') {
                        payload.inputs.expected_returns /= 100;
                        payload.inputs.cpi /= 100;
                        payload.target_monthly_spend = this.getNodeParameter('targetMonthlySpend', i) as number;
                    }
                    if (operation === 'calculateWithTargetSpend') {
                        payload.target_monthly_spend = this.getNodeParameter('targetMonthlySpend', i) as number;
                    }

                    const endpoint = operation === 'calculateMaxSpend' ? 'calculate-max-spend' :
                        operation === 'calculateMaxSpendWithYearlyData' ? 'calculate-max-spend-with-yearly-data' :
                            operation === 'calculateWithTargetSpend' ? 'calculate-with-target-spend' : 'monte-carlo';

                    response = await this.helpers.httpRequest({
                        method: 'POST',
                        url: `${baseUrl}/${endpoint}`,
                        body: payload,
                        headers: { 'Content-Type': 'application/json', 'x-api-key': credentials.apiKey as string },
                        json: true,
                    });
                }

                returnData.push({ json: response });
            } catch (error) {
                if (this.continueOnFail()) {
                    returnData.push({ json: { error: (error as Error).message } });
                    continue;
                }
                throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
            }
        }
        return [returnData];
    }
}
