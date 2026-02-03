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
    const operation = context.getNodeParameter('operation', itemIndex) as string;
    const scenarioType = context.getNodeParameter('scenarioType', itemIndex) as string;
    const isIndividual = scenarioType === 'individual';

    // Helper to get collection parameters safely
    const getCollection = (paramName: string) => context.getNodeParameter(paramName, itemIndex, {}) as Record<string, unknown>;

    // Common Inputs - use safe defaults if operation is monteCarlo (where these are hidden)
    let expectedReturns = 0;
    let cpi = 0;
    
    if (operation !== 'monteCarlo' && operation !== 'getSimulationStatus' && operation !== 'getSimulationResult') {
        expectedReturns = context.getNodeParameter('expectedReturns', itemIndex) as number;
        cpi = context.getNodeParameter('cpi', itemIndex) as number;
    }
    
    const province = context.getNodeParameter('province', itemIndex) as string;

    // Global Settings (Top Level)
    const baseTfsa = context.getNodeParameter('baseTfsa', itemIndex) as number;
    const calculateGis = context.getNodeParameter('calculateGis', itemIndex) as boolean;
    const allocation = context.getNodeParameter('allocation', itemIndex) as number;
    const incomeSplit = context.getNodeParameter('incomeSplit', itemIndex) as boolean;
    const survivorExpensePercent = context.getNodeParameter('survivorExpensePercent', itemIndex) as number;

    // Monte Carlo Specific
    let enableBeltTightening = false;
    if (operation === 'monteCarlo') {
        enableBeltTightening = context.getNodeParameter('enableBeltTightening', itemIndex) as boolean;
    }

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

    // Helper to get withdrawal weights
    const getWithdrawalWeights = (paramName: string) => {
        const weights = context.getNodeParameter(paramName, itemIndex, {}) as Record<string, number>;
        return [
            { account: 'rrsp', weight_pct: weights.rrspWeight !== undefined ? weights.rrspWeight : 100 },
            { account: 'tfsa', weight_pct: weights.tfsaWeight !== undefined ? weights.tfsaWeight : 0 },
            { account: 'non_registered', weight_pct: weights.nonRegWeight !== undefined ? weights.nonRegWeight : 0 },
        ];
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
            
            // P1 Top Level Overrides
            cpp_start_age: context.getNodeParameter('p1CppStartAge', itemIndex) as number,
            oas_start_age: context.getNodeParameter('p1OasStartAge', itemIndex) as number,
            base_cpp_amount: context.getNodeParameter('p1BaseCppAmount', itemIndex) as number,
            base_oas_amount: context.getNodeParameter('p1BaseOasAmount', itemIndex) as number,
            enable_rrsp_meltdown: context.getNodeParameter('p1Meltdown', itemIndex) as boolean,
            rrif_conversion_age: context.getNodeParameter('p1RrifAge', itemIndex) as number,

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
            db_cpp_clawback_fraction: (p1Db.cppClawbackFraction as number || 0) / 100,
            db_survivor_benefit_percentage: p1Db.survivorBenefit || 0,
            pension_plan_type: 'Generic',
            has_10_year_guarantee: p1Db.hasGuarantee || false,
            // Assumptions P1 (Individualized)
            non_registered_growth_capital_gains_pct: p1Adv.nonRegGrowthCapGains || 100,
            non_registered_dividend_yield_pct: p1Adv.nonRegDivYield || 0,
            non_registered_eligible_dividend_proportion_pct: p1Adv.nonRegEligDiv || 70,
            lif_conversion_age: p1Adv.lifAge || 71,
        },
        person2_ui: {
            name: isIndividual ? 'Person 2' : context.getNodeParameter('p2Name', itemIndex) as string,
            current_age: isIndividual ? 55 : context.getNodeParameter('p2CurrentAge', itemIndex) as number,
            retirement_age: isIndividual ? 65 : context.getNodeParameter('p2RetirementAge', itemIndex) as number,
            death_age: isIndividual ? 90 : context.getNodeParameter('p2DeathAge', itemIndex) as number,
            rrsp: isIndividual ? 0 : context.getNodeParameter('p2Rrsp', itemIndex) as number,
            tfsa: isIndividual ? 0 : context.getNodeParameter('p2Tfsa', itemIndex) as number,
            non_registered: p2NonReg,
            lira: p2Adv.lira || 0,
            cost_basis: p2CostBasis,
            rrsp_contribution_room: p2Adv.rrspContributionRoom || 0,
            tfsa_contribution_room: p2Adv.tfsaContributionRoom || 0,
            
            // P2 Top Level Overrides (Defaults if individual)
            cpp_start_age: isIndividual ? 65 : context.getNodeParameter('p2CppStartAge', itemIndex) as number,
            oas_start_age: isIndividual ? 65 : context.getNodeParameter('p2OasStartAge', itemIndex) as number,
            base_cpp_amount: isIndividual ? 0 : context.getNodeParameter('p2BaseCppAmount', itemIndex) as number,
            base_oas_amount: isIndividual ? 8876 : context.getNodeParameter('p2BaseOasAmount', itemIndex) as number,
            enable_rrsp_meltdown: isIndividual ? false : context.getNodeParameter('p2Meltdown', itemIndex) as boolean,
            rrif_conversion_age: isIndividual ? 71 : context.getNodeParameter('p2RrifAge', itemIndex) as number,

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
            db_cpp_clawback_fraction: (p2Db.cppClawbackFraction as number || 0) / 100,
            db_survivor_benefit_percentage: p2Db.survivorBenefit || 0,
            pension_plan_type: 'Generic',
            has_10_year_guarantee: p2Db.hasGuarantee || false,
            // Assumptions P2 (Individualized)
            non_registered_growth_capital_gains_pct: p2Adv.nonRegGrowthCapGains || 100,
            non_registered_dividend_yield_pct: p2Adv.nonRegDivYield || 0,
            non_registered_eligible_dividend_proportion_pct: p2Adv.nonRegEligDiv || 70,
            lif_conversion_age: p2Adv.lifAge || 71,
        },
        inputs: {
            expected_returns: expectedReturns,
            cpi: cpi,
            province: province,
            individual: isIndividual,
            income_split: incomeSplit,
            allocation: allocation,
            survivor_expense_percent: survivorExpensePercent,
            base_tfsa_amount: baseTfsa,
            calculate_gis: calculateGis,
            rrif_min_withdrawal: true,
            enable_belt_tightening: enableBeltTightening,
            // Hardcoded Monte Carlo Defaults (FP Canada Baseline)
            return_std_dev: 0.09,
            cpi_std_dev: 0.012,
            return_cpi_correlation: -0.05,
            num_trials: 1000,
            distribution_model: 'lognormal',
        },
        withdrawal_strategy: {
            person1: {
                weights: [
                    ...getWithdrawalWeights('p1WithdrawalWeights'),
                    { type: 'fallback', order: getWithdrawalOrder('p1WithdrawalStrategy') }
                ]
            },
            person2: {
                weights: [
                    ...getWithdrawalWeights('p2WithdrawalWeights'),
                    { type: 'fallback', order: getWithdrawalOrder('p2WithdrawalStrategy') }
                ]
            },
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
                displayName: 'Enable Belt Tightening',
                name: 'enableBeltTightening',
                type: 'boolean',
                default: false,
                displayOptions: { show: { resource: ['plan'], operation: ['monteCarlo'] } },
                description: 'Whether to forgo inflation adjustments on expenses after negative return years',
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
                default: 55,
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
                default: 90,
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
                displayName: 'Person 1 - Base CPP Amount',
                name: 'p1BaseCppAmount',
                type: 'number',
                default: 0,
                displayOptions: { show: { resource: ['plan'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
            },
            {
                displayName: 'Person 1 - Base OAS Amount',
                name: 'p1BaseOasAmount',
                type: 'number',
                default: 8876,
                displayOptions: { show: { resource: ['plan'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
            },
            {
                displayName: 'Person 1 - CPP Start Age',
                name: 'p1CppStartAge',
                type: 'number',
                default: 65,
                displayOptions: { show: { resource: ['plan'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
            },
            {
                displayName: 'Person 1 - OAS Start Age',
                name: 'p1OasStartAge',
                type: 'number',
                default: 65,
                displayOptions: { show: { resource: ['plan'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
            },
            {
                displayName: 'Person 1 - RRIF Conversion Age',
                name: 'p1RrifAge',
                type: 'number',
                default: 71,
                displayOptions: { show: { resource: ['plan'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
            },
            {
                displayName: 'Person 1 - Enable RRSP Meltdown',
                name: 'p1Meltdown',
                type: 'boolean',
                default: false,
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
                default: 90,
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
                displayName: 'Person 2 - Base CPP Amount',
                name: 'p2BaseCppAmount',
                type: 'number',
                default: 0,
                displayOptions: { show: { resource: ['plan'], scenarioType: ['couple'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
            },
            {
                displayName: 'Person 2 - Base OAS Amount',
                name: 'p2BaseOasAmount',
                type: 'number',
                default: 8876,
                displayOptions: { show: { resource: ['plan'], scenarioType: ['couple'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
            },
            {
                displayName: 'Person 2 - CPP Start Age',
                name: 'p2CppStartAge',
                type: 'number',
                default: 65,
                displayOptions: { show: { resource: ['plan'], scenarioType: ['couple'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
            },
            {
                displayName: 'Person 2 - OAS Start Age',
                name: 'p2OasStartAge',
                type: 'number',
                default: 65,
                displayOptions: { show: { resource: ['plan'], scenarioType: ['couple'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
            },
            {
                displayName: 'Person 2 - RRIF Conversion Age',
                name: 'p2RrifAge',
                type: 'number',
                default: 71,
                displayOptions: { show: { resource: ['plan'], scenarioType: ['couple'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
            },
            {
                displayName: 'Person 2 - Enable RRSP Meltdown',
                name: 'p2Meltdown',
                type: 'boolean',
                default: false,
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
                default: 5.0,
                displayOptions: { show: { resource: ['plan'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult', 'monteCarlo'] } },
            },
            {
                displayName: 'Inflation Rate (%)',
                name: 'cpi',
                type: 'number',
                default: 2.5,
                displayOptions: { show: { resource: ['plan'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult', 'monteCarlo'] } },
            },
            {
                displayName: 'Base TFSA Room',
                name: 'baseTfsa',
                type: 'number',
                default: 7000,
                displayOptions: { show: { resource: ['plan'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
            },
            {
                displayName: 'Calculate GIS',
                name: 'calculateGis',
                type: 'boolean',
                default: false,
                displayOptions: { show: { resource: ['plan'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
            },
            {
                displayName: 'Expense Allocation %',
                name: 'allocation',
                type: 'number',
                default: 50,
                description: 'Split of expenses between spouses',
                displayOptions: { show: { resource: ['plan'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
            },
            {
                displayName: 'Income Splitting',
                name: 'incomeSplit',
                type: 'boolean',
                default: false,
                displayOptions: { show: { resource: ['plan'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
            },
            {
                displayName: 'Survivor Expense %',
                name: 'survivorExpensePercent',
                type: 'number',
                default: 80,
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
                    { displayName: 'LIF Conversion Age', name: 'lifAge', type: 'number', default: 71 },
                    { displayName: 'LIRA Balance', name: 'lira', type: 'number', default: 0 },
                    { displayName: 'Non-Reg Dividend Yield %', name: 'nonRegDivYield', type: 'number', default: 0 },
                    { displayName: 'Non-Reg Eligible Div %', name: 'nonRegEligDiv', type: 'number', default: 70 },
                    { displayName: 'Non-Reg Growth Capital Gains %', name: 'nonRegGrowthCapGains', type: 'number', default: 100 },
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
                    { displayName: 'LIF Conversion Age', name: 'lifAge', type: 'number', default: 71 },
                    { displayName: 'LIRA Balance', name: 'lira', type: 'number', default: 0 },
                    { displayName: 'Non-Reg Dividend Yield %', name: 'nonRegDivYield', type: 'number', default: 0 },
                    { displayName: 'Non-Reg Eligible Div %', name: 'nonRegEligDiv', type: 'number', default: 70 },
                    { displayName: 'Non-Reg Growth Capital Gains %', name: 'nonRegGrowthCapGains', type: 'number', default: 100 },
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
                    { displayName: 'CPP Integration (Bridge Benefit) %', name: 'cppClawbackFraction', type: 'number', default: 0, description: 'Percentage (0-100)' },
                    { displayName: 'Enable DB Pension', name: 'enabled', type: 'boolean', default: false },
                    { displayName: 'Guarantee Period (10yr)', name: 'hasGuarantee', type: 'boolean', default: false },
                    { displayName: 'Index After Retirement %', name: 'indexAfter', type: 'number', default: 0 },
                    { displayName: 'Index After Retirement to CPI', name: 'indexAfterToCpi', type: 'boolean', default: false },
                    { displayName: 'Index Before Retirement', name: 'indexBefore', type: 'boolean', default: true },
                    { displayName: 'Is Survivor Pension?', name: 'isSurvivor', type: 'boolean', default: false },
                    { displayName: 'Start Age', name: 'startAge', type: 'number', default: 65 },
                    { displayName: 'Survivor Benefit %', name: 'survivorBenefit', type: 'number', default: 0 },
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
                    { displayName: 'CPP Integration (Bridge Benefit) %', name: 'cppClawbackFraction', type: 'number', default: 0, description: 'Percentage (0-100)' },
                    { displayName: 'Enable DB Pension', name: 'enabled', type: 'boolean', default: false },
                    { displayName: 'Guarantee Period (10yr)', name: 'hasGuarantee', type: 'boolean', default: false },
                    { displayName: 'Index After Retirement %', name: 'indexAfter', type: 'number', default: 0 },
                    { displayName: 'Index After Retirement to CPI', name: 'indexAfterToCpi', type: 'boolean', default: false },
                    { displayName: 'Index Before Retirement', name: 'indexBefore', type: 'boolean', default: true },
                    { displayName: 'Is Survivor Pension?', name: 'isSurvivor', type: 'boolean', default: false },
                    { displayName: 'Start Age', name: 'startAge', type: 'number', default: 65 },
                    { displayName: 'Survivor Benefit %', name: 'survivorBenefit', type: 'number', default: 0 },
                ],
            },

            // --- Global/Investment Assumptions ---
            // MOVED TO TOP LEVEL: Global Settings collection removed.
            // --- Withdrawal Weights: Person 1 ---
            {
                displayName: 'Person 1 - Withdrawal Weights',
                name: 'p1WithdrawalWeights',
                type: 'collection',
                placeholder: 'Add Weights',
                default: {},
                displayOptions: { show: { resource: ['plan'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
                options: [
                    {
                        displayName: 'Non-Registered (%)',
                        name: 'nonRegWeight',
                        type: 'number',
                        default: 0,
                        description: 'Percentage of withdrawal to take from Non-Registered initially',
                    },
                    {
                        displayName: 'RRSP / RRIF (%)',
                        name: 'rrspWeight',
                        type: 'number',
                        default: 100,
                        description: 'Percentage of withdrawal to take from RRSP/RRIF initially',
                    },
                    {
                        displayName: 'TFSA (%)',
                        name: 'tfsaWeight',
                        type: 'number',
                        default: 0,
                        description: 'Percentage of withdrawal to take from TFSA initially',
                    },
                ],
            },
            // --- Withdrawal Strategy: Person 1 ---
            {
                displayName: 'Person 1 - Fallback Order',
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

            // --- Withdrawal Weights: Person 2 ---
            {
                displayName: 'Person 2 - Withdrawal Weights',
                name: 'p2WithdrawalWeights',
                type: 'collection',
                placeholder: 'Add Weights',
                default: {},
                displayOptions: { show: { resource: ['plan'], scenarioType: ['couple'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
                options: [
                    {
                        displayName: 'Non-Registered (%)',
                        name: 'nonRegWeight',
                        type: 'number',
                        default: 0,
                        description: 'Percentage of withdrawal to take from Non-Registered initially',
                    },
                    {
                        displayName: 'RRSP / RRIF (%)',
                        name: 'rrspWeight',
                        type: 'number',
                        default: 100,
                        description: 'Percentage of withdrawal to take from RRSP/RRIF initially',
                    },
                    {
                        displayName: 'TFSA (%)',
                        name: 'tfsaWeight',
                        type: 'number',
                        default: 0,
                        description: 'Percentage of withdrawal to take from TFSA initially',
                    },
                ],
            },
            // --- Withdrawal Strategy: Person 2 (Couple Only) ---
            {
                displayName: 'Person 2 - Fallback Order',
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
                        payload.inputs.expected_returns = 0.045;
                        payload.inputs.cpi = 0.023;
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
