import {
    IExecuteFunctions,
    INodeExecutionData,
    INodeType,
    INodeTypeDescription,
    NodeOperationError,
} from 'n8n-workflow';

// Helper function to build the base API payload (mirrors the working MCP server logic)
function constructPayload(context: IExecuteFunctions, itemIndex: number): any {
    const scenarioType = context.getNodeParameter('scenarioType', itemIndex) as string;
    const isIndividual = scenarioType === 'individual';

    // Get common parameters
    const p1CurrentAge = context.getNodeParameter('p1CurrentAge', itemIndex) as number;
    const p1RetirementAge = context.getNodeParameter('p1RetirementAge', itemIndex) as number;
    const p1DeathAge = context.getNodeParameter('p1DeathAge', itemIndex) as number;
    const province = context.getNodeParameter('province', itemIndex) as string;
    const expectedReturns = context.getNodeParameter('expectedReturns', itemIndex) as number;
    const cpi = context.getNodeParameter('cpi', itemIndex) as number;

    // Get advanced options
    const advancedOptions = context.getNodeParameter('advancedOptions', itemIndex, {}) as Record<string, any>;
    const person2Options = isIndividual ? {} : context.getNodeParameter('person2Options', itemIndex, {}) as Record<string, any>;

    const p1NonReg = context.getNodeParameter('p1NonRegistered', itemIndex) as number || 0;
    const p2NonReg = person2Options.p2NonRegistered || 0;

    // ACB Logic (mirrors MCP server)
    const p1CostBasis = advancedOptions.p1NonRegAcb !== undefined ? advancedOptions.p1NonRegAcb : (p1NonReg * 0.9);
    const p2CostBasis = person2Options.p2NonRegAcb !== undefined ? person2Options.p2NonRegAcb : (p2NonReg * 0.9);

    return {
        person1_ui: {
            name: 'Person 1',
            current_age: p1CurrentAge,
            retirement_age: p1RetirementAge,
            death_age: p1DeathAge,
            province: province,
            rrsp: context.getNodeParameter('p1Rrsp', itemIndex),
            tfsa: context.getNodeParameter('p1Tfsa', itemIndex),
            non_registered: p1NonReg,
            lira: advancedOptions.p1Lira || 0,
            cost_basis: p1CostBasis,
            rrsp_contribution_room: advancedOptions.p1RrspContributionRoom || 0,
            tfsa_contribution_room: advancedOptions.p1TfsaContributionRoom || 0,
            cpp_start_age: advancedOptions.p1CppStartAge || 65,
            oas_start_age: advancedOptions.p1OasStartAge || 65,
            base_cpp_amount: advancedOptions.p1BaseCppAmount || 12000,
            base_oas_amount: advancedOptions.p1BaseOasAmount || 8800,
            rrsp_contribution: advancedOptions.p1RrspContribution || 0,
            tfsa_contribution: advancedOptions.p1TfsaContribution || 0,
            non_registered_contribution: advancedOptions.p1NonRegisteredContribution || 0,
            db_enabled: advancedOptions.p1DbEnabled || false,
            db_pension_income: advancedOptions.p1DbPensionIncome || 0,
            db_start_age: advancedOptions.p1DbStartAge || 65,
            db_index_before_retirement: advancedOptions.p1DbIndexBefore !== undefined ? advancedOptions.p1DbIndexBefore : true,
            db_index_after_retirement: advancedOptions.p1DbIndexAfter || 0,
            enable_rrsp_meltdown: advancedOptions.p1Meltdown || false,
        },
        person2_ui: {
            name: 'Person 2',
            current_age: person2Options.p2CurrentAge || p1CurrentAge,
            retirement_age: person2Options.p2Retire || p1RetirementAge,
            death_age: person2Options.p2DeathAge || p1DeathAge,
            rrsp: person2Options.p2Rrsp || 0,
            tfsa: person2Options.p2Tfsa || 0,
            non_registered: p2NonReg,
            lira: person2Options.p2Lira || 0,
            cost_basis: p2CostBasis,
            rrsp_contribution_room: person2Options.p2RrspContributionRoom || 0,
            tfsa_contribution_room: person2Options.p2TfsaContributionRoom || 0,
            cpp_start_age: person2Options.p2CppStartAge || 65,
            oas_start_age: person2Options.p2OasStartAge || 65,
            base_cpp_amount: person2Options.p2BaseCppAmount || 0,
            base_oas_amount: person2Options.p2BaseOasAmount || 0,
            rrsp_contribution: person2Options.p2RrspContribution || 0,
            tfsa_contribution: person2Options.p2TfsaContribution || 0,
            non_registered_contribution: person2Options.p2NonRegisteredContribution || 0,
            db_enabled: person2Options.p2DbEnabled || false,
            db_pension_income: person2Options.p2DbPensionIncome || 0,
            db_start_age: person2Options.p2DbStartAge || 65,
        },
        inputs: {
            expected_returns: expectedReturns,
            cpi: cpi,
            province: province,
            individual: isIndividual,
            income_split: advancedOptions.incomeSplit !== undefined ? advancedOptions.incomeSplit : !isIndividual,
            allocation: advancedOptions.allocation || 50,
            survivor_expense_percent: advancedOptions.survivorExpensePercent || 100,
            base_tfsa_amount: advancedOptions.baseTfsaAmount || 7000,
        },
        withdrawal_strategy: {
            person1: { weights: [{ type: 'fallback', order: ['rrsp', 'non_registered', 'tfsa'] }] },
            person2: { weights: [{ type: 'fallback', order: ['rrsp', 'non_registered', 'tfsa'] }] },
        },
    };
}

export class NowCapital implements INodeType {
    description: INodeTypeDescription = {
        displayName: 'NowCapital',
        name: 'nowCapital',
        icon: 'file:nowcapital.svg',
        group: ['transform'],
        version: 1,
        subtitle: '={{$parameter["operation"]}}',
        description: 'Canadian Retirement Planning Calculator - SUS Version',
        defaults: { name: 'NowCapital' },
        inputs: ['main'],
        outputs: ['main'],
        credentials: [{ name: 'nowCapitalApi', required: true }],
        properties: [
            {
                displayName: 'Operation',
                name: 'operation',
                type: 'options',
                noDataExpression: true,
                options: [
                    { name: 'Calculate Sustainable Spend', value: 'calculateMaxSpend', action: 'Calculate sustainable monthly spending' },
                    { name: 'Get Detailed Projections', value: 'calculateMaxSpendWithYearlyData', action: 'Get detailed yearly projections' },
                    { name: 'Calculate Specific Spend', value: 'calculateWithTargetSpend', action: 'Calculate with target spending' },
                    { name: 'Run Monte Carlo Simulation', value: 'monteCarlo', action: 'Start monte carlo simulation' },
                    { name: 'Get Simulation Status', value: 'getSimulationStatus', action: 'Get simulation status' },
                ],
                default: 'calculateMaxSpend',
            },
            {
                displayName: 'Target Monthly Spend',
                name: 'targetMonthlySpend',
                type: 'number',
                default: 5000,
                required: true,
                displayOptions: { show: { operation: ['calculateWithTargetSpend', 'monteCarlo'] } },
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
                displayOptions: { hide: { operation: ['getSimulationStatus'] } },
            },
            {
                displayName: 'Person 1 - Current Age',
                name: 'p1CurrentAge',
                type: 'number',
                default: 60,
                displayOptions: { hide: { operation: ['getSimulationStatus'] } },
            },
            {
                displayName: 'Person 1 - Retirement Age',
                name: 'p1RetirementAge',
                type: 'number',
                default: 65,
                displayOptions: { hide: { operation: ['getSimulationStatus'] } },
            },
            {
                displayName: 'Person 1 - Death Age',
                name: 'p1DeathAge',
                type: 'number',
                default: 92,
                displayOptions: { hide: { operation: ['getSimulationStatus'] } },
            },
            {
                displayName: 'Person 1 - RRSP Balance',
                name: 'p1Rrsp',
                type: 'number',
                default: 500000,
                displayOptions: { hide: { operation: ['getSimulationStatus'] } },
            },
            {
                displayName: 'Person 1 - TFSA Balance',
                name: 'p1Tfsa',
                type: 'number',
                default: 100000,
                displayOptions: { hide: { operation: ['getSimulationStatus'] } },
            },
            {
                displayName: 'Person 1 - Non-Registered Balance',
                name: 'p1NonRegistered',
                type: 'number',
                default: 0,
                displayOptions: { hide: { operation: ['getSimulationStatus'] } },
            },
            {
                displayName: 'Province',
                name: 'province',
                type: 'options',
                options: [{ name: 'Ontario', value: 'ON' }, { name: 'BC', value: 'BC' }, { name: 'Alberta', value: 'AB' }, { name: 'Quebec', value: 'QC' }],
                default: 'ON',
                displayOptions: { hide: { operation: ['getSimulationStatus'] } },
            },
            {
                displayName: 'Expected Returns (%)',
                name: 'expectedReturns',
                type: 'number',
                default: 4.5,
                displayOptions: { hide: { operation: ['getSimulationStatus'] } },
            },
            {
                displayName: 'Inflation Rate (%)',
                name: 'cpi',
                type: 'number',
                default: 2.3,
                displayOptions: { hide: { operation: ['getSimulationStatus'] } },
            },
            {
                displayName: 'Task ID',
                name: 'taskId',
                type: 'string',
                default: '',
                displayOptions: { show: { operation: ['getSimulationStatus'] } },
            },
            {
                displayName: 'Advanced Options',
                name: 'advancedOptions',
                type: 'collection',
                placeholder: 'Add Option',
                default: {},
                displayOptions: { hide: { operation: ['getSimulationStatus'] } },
                options: [
                    { displayName: 'RRSP Contribution Room', name: 'p1RrspContributionRoom', type: 'number', default: 0 },
                    { displayName: 'TFSA Contribution Room', name: 'p1TfsaContributionRoom', type: 'number', default: 0 },
                    { displayName: 'Annual RRSP Contrib', name: 'p1RrspContribution', type: 'number', default: 0 },
                    { displayName: 'Annual TFSA Contrib', name: 'p1TfsaContribution', type: 'number', default: 0 },
                    { displayName: 'Annual Non-Reg Contrib', name: 'p1NonRegisteredContribution', type: 'number', default: 0 },
                    { displayName: 'CPP Start Age', name: 'p1CppStartAge', type: 'number', default: 65 },
                    { displayName: 'OAS Start Age', name: 'p1OasStartAge', type: 'number', default: 65 },
                    { displayName: 'Base CPP Amount', name: 'p1BaseCppAmount', type: 'number', default: 17196 },
                    { displayName: 'Base OAS Amount', name: 'p1BaseOasAmount', type: 'number', default: 8876 },
                    { displayName: 'Enable DB Pension', name: 'p1DbEnabled', type: 'boolean', default: false },
                    { displayName: 'DB Pension Income', name: 'p1DbPensionIncome', type: 'number', default: 0 },
                    { displayName: 'DB Start Age', name: 'p1DbStartAge', type: 'number', default: 65 },
                    { displayName: 'Enable RRSP Meltdown', name: 'p1Meltdown', type: 'boolean', default: false },
                    { displayName: 'Income Splitting', name: 'incomeSplit', type: 'boolean', default: true },
                    { displayName: 'Survivor Expense %', name: 'survivorExpensePercent', type: 'number', default: 100 },
                ],
            },
            {
                displayName: 'Person 2 Options',
                name: 'person2Options',
                type: 'collection',
                placeholder: 'Add Details',
                default: {},
                displayOptions: { show: { scenarioType: ['couple'] }, hide: { operation: ['getSimulationStatus'] } },
                options: [
                    { displayName: 'Current Age', name: 'p2CurrentAge', type: 'number', default: 60 },
                    { displayName: 'Retirement Age', name: 'p2Retire', type: 'number', default: 65 },
                    { displayName: 'Death Age', name: 'p2DeathAge', type: 'number', default: 92 },
                    { displayName: 'RRSP', name: 'p2Rrsp', type: 'number', default: 0 },
                    { displayName: 'TFSA', name: 'p2Tfsa', type: 'number', default: 0 },
                    { displayName: 'Non-Reg', name: 'p2NonRegistered', type: 'number', default: 0 },
                ],
            },
        ],
    };

    async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
        const items = this.getInputData();
        const returnData: INodeExecutionData[] = [];
        const credentials = await this.getCredentials('nowCapitalApi');
        const baseUrl = (credentials.baseUrl as string || 'https://api.nowcapital.ca').replace(/\/$/, '');

        for (let i = 0; i < items.length; i++) {
            try {
                const operation = this.getNodeParameter('operation', i) as string;
                const payload = constructPayload(this, i);

                if (operation === 'monteCarlo') {
                    payload.inputs.expected_returns /= 100;
                    payload.inputs.cpi /= 100;
                    payload.target_monthly_spend = this.getNodeParameter('targetMonthlySpend', i);
                }
                if (operation === 'calculateWithTargetSpend') {
                    payload.target_monthly_spend = this.getNodeParameter('targetMonthlySpend', i);
                }

                let response;
                if (operation === 'getSimulationStatus') {
                    const taskId = this.getNodeParameter('taskId', i) as string;
                    response = await this.helpers.httpRequest({
                        method: 'GET',
                        url: `${baseUrl}/simulations/status/${taskId}`,
                        headers: { 'x-api-key': credentials.apiKey as string },
                        json: true,
                    });
                } else {
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
