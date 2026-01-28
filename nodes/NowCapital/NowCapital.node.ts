import {
    IExecuteFunctions,
    INodeExecutionData,
    INodeType,
    INodeTypeDescription,
    NodeOperationError,
} from 'n8n-workflow';

// Helper function to build the base API payload
function buildCalculateMaxSpendPayload(context: IExecuteFunctions, itemIndex: number): object {
    const scenarioType = context.getNodeParameter('scenarioType', itemIndex) as string;
    const isIndividual = scenarioType === 'individual';

    // Get advanced options with defaults
    const advancedOptions = context.getNodeParameter('advancedOptions', itemIndex, {}) as Record<string, unknown>;
    const person2Options = isIndividual ? {} : context.getNodeParameter('person2Options', itemIndex, {}) as Record<string, unknown>;

    return {
        person1_ui: {
            current_age: context.getNodeParameter('p1CurrentAge', itemIndex),
            retirement_age: context.getNodeParameter('p1RetirementAge', itemIndex),
            death_age: context.getNodeParameter('p1DeathAge', itemIndex),
            rrsp: context.getNodeParameter('p1Rrsp', itemIndex),
            tfsa: context.getNodeParameter('p1Tfsa', itemIndex),
            non_registered: context.getNodeParameter('p1NonRegistered', itemIndex) || 0,
            cpp_start_age: advancedOptions.p1CppStartAge || 65,
            oas_start_age: advancedOptions.p1OasStartAge || 65,
            base_cpp_amount: advancedOptions.p1BaseCppAmount || 12000,
            base_oas_amount: advancedOptions.p1BaseOasAmount || 8800,
            cost_basis: advancedOptions.p1CostBasis || 0,
            lira: advancedOptions.p1Lira || 0,
        },
        person2_ui: {
            current_age: person2Options.p2CurrentAge || context.getNodeParameter('p1CurrentAge', itemIndex),
            retirement_age: person2Options.p2RetirementAge || context.getNodeParameter('p1RetirementAge', itemIndex),
            death_age: person2Options.p2DeathAge || context.getNodeParameter('p1DeathAge', itemIndex),
            rrsp: person2Options.p2Rrsp || 0,
            tfsa: person2Options.p2Tfsa || 0,
            non_registered: person2Options.p2NonRegistered || 0,
            cpp_start_age: person2Options.p2CppStartAge || 65,
            oas_start_age: person2Options.p2OasStartAge || 65,
            base_cpp_amount: person2Options.p2BaseCppAmount || 12000,
            base_oas_amount: person2Options.p2BaseOasAmount || 8800,
        },
        inputs: {
            expected_returns: context.getNodeParameter('expectedReturns', itemIndex),
            cpi: context.getNodeParameter('cpi', itemIndex),
            province: context.getNodeParameter('province', itemIndex),
            individual: isIndividual,
            income_split: advancedOptions.incomeSplit || false,
            allocation: advancedOptions.allocation || 50,
            survivor_expense_percent: advancedOptions.survivorExpensePercent || 100,
        },
        withdrawal_strategy: {
            person1: {
                weights: [
                    { account: 'rrsp', weight_pct: 90.0 },
                    { account: 'non_registered', weight_pct: 0.0 },
                    { account: 'tfsa', weight_pct: 10.0 },
                    { type: 'fallback', order: ['rrsp', 'non_registered', 'tfsa'] },
                ],
            },
            person2: {
                weights: [
                    { account: 'rrsp', weight_pct: 90.0 },
                    { account: 'non_registered', weight_pct: 0.0 },
                    { account: 'tfsa', weight_pct: 10.0 },
                    { type: 'fallback', order: ['rrsp', 'non_registered', 'tfsa'] },
                ],
            },
        },
    };
}

function buildCalculateWithTargetSpendPayload(context: IExecuteFunctions, itemIndex: number): object {
    const basePayload = buildCalculateMaxSpendPayload(context, itemIndex);
    return {
        ...basePayload,
        target_monthly_spend: context.getNodeParameter('targetMonthlySpend', itemIndex),
    };
}

function buildMonteCarloPayload(context: IExecuteFunctions, itemIndex: number): object {
    // Monte Carlo expects returns/cpi as decimals (e.g., 0.045 not 4.5)
    const basePayload = buildCalculateMaxSpendPayload(context, itemIndex) as Record<string, unknown>;
    const inputs = basePayload.inputs as Record<string, unknown>;

    // Convert percentages to decimals for Monte Carlo
    inputs.expected_returns = (inputs.expected_returns as number) / 100;
    inputs.cpi = (inputs.cpi as number) / 100;

    return {
        ...basePayload,
        target_monthly_spend: context.getNodeParameter('targetMonthlySpend', itemIndex),
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
        description: 'Canadian Retirement Planning Calculator - Calculate sustainable spending, projections, and risk analysis',
        defaults: {
            name: 'NowCapital',
        },
        inputs: ['main'],
        outputs: ['main'],
        credentials: [
            {
                name: 'nowCapitalApi',
                required: true,
            },
        ],
        properties: [
            // --- OPERATION SELECTOR ---
            {
                displayName: 'Operation',
                name: 'operation',
                type: 'options',
                noDataExpression: true,
                options: [
                    {
                        name: 'Calculate Sustainable Spend',
                        value: 'calculateMaxSpend',
                        description: 'Calculate the maximum sustainable monthly retirement spending',
                        action: 'Calculate sustainable monthly spending',
                    },
                    {
                        name: 'Get Detailed Projections',
                        value: 'calculateMaxSpendWithYearlyData',
                        description: 'Get year-by-year retirement projections with account balances',
                        action: 'Get detailed yearly projections',
                    },
                    {
                        name: 'Calculate Specific Spend',
                        value: 'calculateWithTargetSpend',
                        description: 'Model a specific monthly spending amount',
                        action: 'Calculate with target spending',
                    },
                    {
                        name: 'Run Monte Carlo Simulation',
                        value: 'monteCarlo',
                        description: '⭐ Premium: Run risk analysis simulation',
                        action: 'Start monte carlo simulation',
                    },
                    {
                        name: 'Get Simulation Status',
                        value: 'getSimulationStatus',
                        description: '⭐ Premium: Check Monte Carlo simulation status',
                        action: 'Get simulation status',
                    },
                ],
                default: 'calculateMaxSpend',
            },

            // --- SCENARIO TYPE ---
            {
                displayName: 'Scenario Type',
                name: 'scenarioType',
                type: 'options',
                options: [
                    { name: 'Individual', value: 'individual' },
                    { name: 'Couple', value: 'couple' },
                ],
                default: 'individual',
                description: 'Whether to calculate for an individual or a couple',
                displayOptions: {
                    show: {
                        operation: [
                            'calculateMaxSpend',
                            'calculateMaxSpendWithYearlyData',
                            'calculateWithTargetSpend',
                            'monteCarlo',
                        ],
                    },
                },
            },

            // --- PERSON 1 PARAMETERS ---
            {
                displayName: 'Person 1 - Current Age',
                name: 'p1CurrentAge',
                type: 'number',
                default: 55,
                required: true,
                description: 'Current age of person 1',
                displayOptions: {
                    show: {
                        operation: [
                            'calculateMaxSpend',
                            'calculateMaxSpendWithYearlyData',
                            'calculateWithTargetSpend',
                            'monteCarlo',
                        ],
                    },
                },
            },
            {
                displayName: 'Person 1 - Retirement Age',
                name: 'p1RetirementAge',
                type: 'number',
                default: 65,
                required: true,
                description: 'Planned retirement age',
                displayOptions: {
                    show: {
                        operation: [
                            'calculateMaxSpend',
                            'calculateMaxSpendWithYearlyData',
                            'calculateWithTargetSpend',
                            'monteCarlo',
                        ],
                    },
                },
            },
            {
                displayName: 'Person 1 - Death Age',
                name: 'p1DeathAge',
                type: 'number',
                default: 90,
                required: true,
                description: 'Planning horizon (assumed death age)',
                displayOptions: {
                    show: {
                        operation: [
                            'calculateMaxSpend',
                            'calculateMaxSpendWithYearlyData',
                            'calculateWithTargetSpend',
                            'monteCarlo',
                        ],
                    },
                },
            },
            {
                displayName: 'Person 1 - RRSP Balance',
                name: 'p1Rrsp',
                type: 'number',
                default: 0,
                required: true,
                description: 'Current RRSP/RRIF balance in dollars',
                displayOptions: {
                    show: {
                        operation: [
                            'calculateMaxSpend',
                            'calculateMaxSpendWithYearlyData',
                            'calculateWithTargetSpend',
                            'monteCarlo',
                        ],
                    },
                },
            },
            {
                displayName: 'Person 1 - TFSA Balance',
                name: 'p1Tfsa',
                type: 'number',
                default: 0,
                required: true,
                description: 'Current TFSA balance in dollars',
                displayOptions: {
                    show: {
                        operation: [
                            'calculateMaxSpend',
                            'calculateMaxSpendWithYearlyData',
                            'calculateWithTargetSpend',
                            'monteCarlo',
                        ],
                    },
                },
            },
            {
                displayName: 'Person 1 - Non-Registered Balance',
                name: 'p1NonRegistered',
                type: 'number',
                default: 0,
                description: 'Current non-registered investment balance in dollars',
                displayOptions: {
                    show: {
                        operation: [
                            'calculateMaxSpend',
                            'calculateMaxSpendWithYearlyData',
                            'calculateWithTargetSpend',
                            'monteCarlo',
                        ],
                    },
                },
            },

            // --- PROVINCE ---
            {
                displayName: 'Province',
                name: 'province',
                type: 'options',
                options: [
                    { name: 'Alberta', value: 'AB' },
                    { name: 'British Columbia', value: 'BC' },
                    { name: 'Manitoba', value: 'MB' },
                    { name: 'New Brunswick', value: 'NB' },
                    { name: 'Newfoundland and Labrador', value: 'NL' },
                    { name: 'Northwest Territories', value: 'NT' },
                    { name: 'Nova Scotia', value: 'NS' },
                    { name: 'Nunavut', value: 'NU' },
                    { name: 'Ontario', value: 'ON' },
                    { name: 'Prince Edward Island', value: 'PE' },
                    { name: 'Quebec', value: 'QC' },
                    { name: 'Saskatchewan', value: 'SK' },
                    { name: 'Yukon', value: 'YT' },
                ],
                default: 'ON',
                description: 'Province of residence for tax calculations',
                displayOptions: {
                    show: {
                        operation: [
                            'calculateMaxSpend',
                            'calculateMaxSpendWithYearlyData',
                            'calculateWithTargetSpend',
                            'monteCarlo',
                        ],
                    },
                },
            },

            // --- ECONOMIC ASSUMPTIONS ---
            {
                displayName: 'Expected Returns (%)',
                name: 'expectedReturns',
                type: 'number',
                default: 6.0,
                description: 'Expected annual investment return (e.g., 6 for 6%)',
                displayOptions: {
                    show: {
                        operation: [
                            'calculateMaxSpend',
                            'calculateMaxSpendWithYearlyData',
                            'calculateWithTargetSpend',
                            'monteCarlo',
                        ],
                    },
                },
            },
            {
                displayName: 'Inflation Rate (%)',
                name: 'cpi',
                type: 'number',
                default: 3.0,
                description: 'Expected annual inflation rate (CPI)',
                displayOptions: {
                    show: {
                        operation: [
                            'calculateMaxSpend',
                            'calculateMaxSpendWithYearlyData',
                            'calculateWithTargetSpend',
                            'monteCarlo',
                        ],
                    },
                },
            },

            // --- TARGET SPEND (for specific operations) ---
            {
                displayName: 'Target Monthly Spend',
                name: 'targetMonthlySpend',
                type: 'number',
                default: 5000,
                required: true,
                description: 'Target monthly spending amount to model',
                displayOptions: {
                    show: {
                        operation: ['calculateWithTargetSpend', 'monteCarlo'],
                    },
                },
            },

            // --- SIMULATION TASK ID ---
            {
                displayName: 'Task ID',
                name: 'taskId',
                type: 'string',
                default: '',
                required: true,
                description: 'The task ID returned from "Run Monte Carlo Simulation"',
                displayOptions: {
                    show: {
                        operation: ['getSimulationStatus'],
                    },
                },
            },

            // --- ADVANCED OPTIONS (Collapsible) ---
            {
                displayName: 'Advanced Options',
                name: 'advancedOptions',
                type: 'collection',
                placeholder: 'Add Option',
                default: {},
                displayOptions: {
                    show: {
                        operation: [
                            'calculateMaxSpend',
                            'calculateMaxSpendWithYearlyData',
                            'calculateWithTargetSpend',
                            'monteCarlo',
                        ],
                    },
                },
                options: [
                    {
                        displayName: 'Person 1 - CPP Start Age',
                        name: 'p1CppStartAge',
                        type: 'number',
                        default: 65,
                        description: 'Age to start receiving CPP benefits (60-70)',
                    },
                    {
                        displayName: 'Person 1 - OAS Start Age',
                        name: 'p1OasStartAge',
                        type: 'number',
                        default: 65,
                        description: 'Age to start receiving OAS benefits (65-70)',
                    },
                    {
                        displayName: 'Person 1 - Base CPP Amount',
                        name: 'p1BaseCppAmount',
                        type: 'number',
                        default: 12000,
                        description: 'Expected annual CPP at age 65',
                    },
                    {
                        displayName: 'Person 1 - Base OAS Amount',
                        name: 'p1BaseOasAmount',
                        type: 'number',
                        default: 8800,
                        description: 'Expected annual OAS at age 65',
                    },
                    {
                        displayName: 'Person 1 - Non-Registered Cost Basis',
                        name: 'p1CostBasis',
                        type: 'number',
                        default: 0,
                        description: 'Adjusted cost base for non-registered investments',
                    },
                    {
                        displayName: 'Person 1 - LIRA Balance',
                        name: 'p1Lira',
                        type: 'number',
                        default: 0,
                        description: 'Locked-In Retirement Account balance',
                    },
                    {
                        displayName: 'Income Splitting',
                        name: 'incomeSplit',
                        type: 'boolean',
                        default: false,
                        description: 'Whether to enable pension income splitting (couples only)',
                    },
                    {
                        displayName: 'Expense Allocation (%)',
                        name: 'allocation',
                        type: 'number',
                        default: 50,
                        description: 'Percentage of household expenses covered by Person 1 (couples)',
                    },
                    {
                        displayName: 'Survivor Expense Percent',
                        name: 'survivorExpensePercent',
                        type: 'number',
                        default: 100,
                        description: 'Percentage of expenses remaining after one spouse dies',
                    },
                ],
            },

            // --- PERSON 2 PARAMETERS (for couples) ---
            {
                displayName: 'Person 2 Options',
                name: 'person2Options',
                type: 'collection',
                placeholder: 'Add Person 2 Details',
                default: {},
                displayOptions: {
                    show: {
                        operation: [
                            'calculateMaxSpend',
                            'calculateMaxSpendWithYearlyData',
                            'calculateWithTargetSpend',
                            'monteCarlo',
                        ],
                        scenarioType: ['couple'],
                    },
                },
                options: [
                    {
                        displayName: 'Person 2 - Current Age',
                        name: 'p2CurrentAge',
                        type: 'number',
                        default: 55,
                    },
                    {
                        displayName: 'Person 2 - Retirement Age',
                        name: 'p2RetirementAge',
                        type: 'number',
                        default: 65,
                    },
                    {
                        displayName: 'Person 2 - Death Age',
                        name: 'p2DeathAge',
                        type: 'number',
                        default: 90,
                    },
                    {
                        displayName: 'Person 2 - RRSP Balance',
                        name: 'p2Rrsp',
                        type: 'number',
                        default: 0,
                    },
                    {
                        displayName: 'Person 2 - TFSA Balance',
                        name: 'p2Tfsa',
                        type: 'number',
                        default: 0,
                    },
                    {
                        displayName: 'Person 2 - Non-Registered Balance',
                        name: 'p2NonRegistered',
                        type: 'number',
                        default: 0,
                    },
                    {
                        displayName: 'Person 2 - CPP Start Age',
                        name: 'p2CppStartAge',
                        type: 'number',
                        default: 65,
                    },
                    {
                        displayName: 'Person 2 - OAS Start Age',
                        name: 'p2OasStartAge',
                        type: 'number',
                        default: 65,
                    },
                    {
                        displayName: 'Person 2 - Base CPP Amount',
                        name: 'p2BaseCppAmount',
                        type: 'number',
                        default: 12000,
                    },
                    {
                        displayName: 'Person 2 - Base OAS Amount',
                        name: 'p2BaseOasAmount',
                        type: 'number',
                        default: 8800,
                    },
                ],
            },
        ],
    };

    async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
        const items = this.getInputData();
        const returnData: INodeExecutionData[] = [];
        const credentials = await this.getCredentials('nowCapitalApi');

        for (let i = 0; i < items.length; i++) {
            try {
                const operation = this.getNodeParameter('operation', i) as string;

                if (operation === 'calculateMaxSpend') {
                    const body = buildCalculateMaxSpendPayload(this, i);

                    const response = await this.helpers.httpRequest({
                        method: 'POST',
                        url: 'https://api.nowcapital.ca/calculate-max-spend',
                        body,
                        headers: {
                            'Content-Type': 'application/json',
                            'x-api-key': credentials.apiKey as string,
                        },
                        json: true,
                    });

                    returnData.push({ json: response });
                }

                if (operation === 'calculateMaxSpendWithYearlyData') {
                    const body = buildCalculateMaxSpendPayload(this, i);

                    const response = await this.helpers.httpRequest({
                        method: 'POST',
                        url: 'https://api.nowcapital.ca/calculate-max-spend-with-yearly-data',
                        body,
                        headers: {
                            'Content-Type': 'application/json',
                            'x-api-key': credentials.apiKey as string,
                        },
                        json: true,
                    });

                    returnData.push({ json: response });
                }

                if (operation === 'calculateWithTargetSpend') {
                    const body = buildCalculateWithTargetSpendPayload(this, i);

                    const response = await this.helpers.httpRequest({
                        method: 'POST',
                        url: 'https://api.nowcapital.ca/calculate-with-target-spend',
                        body,
                        headers: {
                            'Content-Type': 'application/json',
                            'x-api-key': credentials.apiKey as string,
                        },
                        json: true,
                    });

                    returnData.push({ json: response });
                }

                if (operation === 'monteCarlo') {
                    const body = buildMonteCarloPayload(this, i);

                    const response = await this.helpers.httpRequest({
                        method: 'POST',
                        url: 'https://api.nowcapital.ca/monte-carlo',
                        body,
                        headers: {
                            'Content-Type': 'application/json',
                            'x-api-key': credentials.apiKey as string,
                        },
                        json: true,
                    });

                    returnData.push({ json: response });
                }

                if (operation === 'getSimulationStatus') {
                    const taskId = this.getNodeParameter('taskId', i) as string;

                    const response = await this.helpers.httpRequest({
                        method: 'GET',
                        url: `https://api.nowcapital.ca/simulations/status/${taskId}`,
                        headers: {
                            'x-api-key': credentials.apiKey as string,
                        },
                        json: true,
                    });

                    returnData.push({ json: response });
                }

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
