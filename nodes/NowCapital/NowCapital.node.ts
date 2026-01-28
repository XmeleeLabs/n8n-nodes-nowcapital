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
function constructPayload(context: IExecuteFunctions, itemIndex: number): CalculationPayload {
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
    const advancedOptions = context.getNodeParameter('advancedOptions', itemIndex, {}) as Record<string, unknown>;
    const person2Options = isIndividual ? {} : context.getNodeParameter('person2Options', itemIndex, {}) as Record<string, unknown>;

    const p1NonReg = context.getNodeParameter('p1NonRegistered', itemIndex) as number || 0;
    const p1NonRegAcb = advancedOptions.p1NonRegAcb as number | undefined;
    const p2NonReg = (person2Options.p2NonRegistered as number) || 0;
    const p2NonRegAcb = person2Options.p2NonRegAcb as number | undefined;

    // ACB Logic (mirrors MCP server)
    const p1CostBasis = p1NonRegAcb !== undefined ? p1NonRegAcb : (p1NonReg * 0.9);
    const p2CostBasis = p2NonRegAcb !== undefined ? p2NonRegAcb : (p2NonReg * 0.9);

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
            current_age: (person2Options.p2CurrentAge as number) || p1CurrentAge,
            retirement_age: (person2Options.p2Retire as number) || p1RetirementAge,
            death_age: (person2Options.p2DeathAge as number) || p1DeathAge,
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
        description: 'Advanced Canadian Retirement Planning & Monte Carlo Simulations',
        defaults: { name: 'NowCapital' },
        inputs: ['main'],
        outputs: ['main'],
        credentials: [{ name: 'nowCapitalApi', required: true }],
        properties: [
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
            {
                displayName: 'Advanced Options',
                name: 'advancedOptions',
                type: 'collection',
                placeholder: 'Add Option',
                default: {},
                displayOptions: { show: { resource: ['plan'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
                options: [
                    { displayName: 'Annual Non-Reg Contrib', name: 'p1NonRegisteredContribution', type: 'number', default: 0 },
                    { displayName: 'Annual RRSP Contrib', name: 'p1RrspContribution', type: 'number', default: 0 },
                    { displayName: 'Annual TFSA Contrib', name: 'p1TfsaContribution', type: 'number', default: 0 },
                    { displayName: 'Base CPP Amount', name: 'p1BaseCppAmount', type: 'number', default: 17196 },
                    { displayName: 'Base OAS Amount', name: 'p1BaseOasAmount', type: 'number', default: 8876 },
                    { displayName: 'CPP Start Age', name: 'p1CppStartAge', type: 'number', default: 65 },
                    { displayName: 'DB Pension Income', name: 'p1DbPensionIncome', type: 'number', default: 0 },
                    { displayName: 'DB Start Age', name: 'p1DbStartAge', type: 'number', default: 65 },
                    { displayName: 'Enable DB Pension', name: 'p1DbEnabled', type: 'boolean', default: false },
                    { displayName: 'Enable RRSP Meltdown', name: 'p1Meltdown', type: 'boolean', default: false },
                    { displayName: 'Income Splitting', name: 'incomeSplit', type: 'boolean', default: true },
                    { displayName: 'OAS Start Age', name: 'p1OasStartAge', type: 'number', default: 65 },
                    { displayName: 'RRSP Contribution Room', name: 'p1RrspContributionRoom', type: 'number', default: 0 },
                    { displayName: 'Survivor Expense %', name: 'survivorExpensePercent', type: 'number', default: 100 },
                    { displayName: 'TFSA Contribution Room', name: 'p1TfsaContributionRoom', type: 'number', default: 0 },
                ],
            },
            {
                displayName: 'Person 2 Options',
                name: 'person2Options',
                type: 'collection',
                placeholder: 'Add Details',
                default: {},
                displayOptions: { show: { resource: ['plan'], scenarioType: ['couple'] }, hide: { operation: ['getSimulationStatus', 'getSimulationResult'] } },
                options: [
                    { displayName: 'Current Age', name: 'p2CurrentAge', type: 'number', default: 60 },
                    { displayName: 'Death Age', name: 'p2DeathAge', type: 'number', default: 92 },
                    { displayName: 'Non-Reg', name: 'p2NonRegistered', type: 'number', default: 0 },
                    { displayName: 'Retirement Age', name: 'p2Retire', type: 'number', default: 65 },
                    { displayName: 'RRSP', name: 'p2Rrsp', type: 'number', default: 0 },
                    { displayName: 'TFSA', name: 'p2Tfsa', type: 'number', default: 0 },
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
