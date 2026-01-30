/*
import { IExecuteFunctions } from 'n8n-workflow';
import { constructPayload } from '../nodes/NowCapital/NowCapital.node';

const mockParams: Record<string, unknown> = {
    scenarioType: 'couple',
    p1CurrentAge: 60,
    p1RetirementAge: 65,
    p1DeathAge: 95,
    province: 'ON',
    expectedReturns: 5.0,
    cpi: 2.5,
    p1Name: 'Alice',
    p1Rrsp: 100000,
    p1Tfsa: 50000,
    p1NonRegistered: 20000,
    p1NonRegAcb: 15000, // Explicit ACB for P1
    p2Name: 'Bob',
    p2CurrentAge: 58,
    p2RetirementAge: 63,
    p2DeathAge: 92,
    p2Rrsp: 150000,
    p2Tfsa: 60000,
    p2NonRegistered: 10000,
    // P2 has no ACB, so should use default calculation

    // Advanced / Collections
    globalSettings: {
        incomeSplit: true,
        allocation: 50,
        calculateGis: true,
        baseTfsa: 8000 // Global Base TFSA override
    },
    p1AdvancedOptions: {
        baseCppAmount: 18000,
        lifAge: 72, // P1 specific conversion age
    },
    p2AdvancedOptions: {},
    p1DbPension: {
        enabled: true,
        income: 20000,
        startAge: 65
    },
    p2DbPension: {},
    p1WithdrawalStrategy: {
        order: { first: 'tfsa', second: 'rrsp', third: 'non_registered' }
    },
    p2WithdrawalStrategy: {}
};

const context = {
    getNodeParameter: (name: string, index: number, defVal: unknown) => {
        // Handle n8n behavior where it returns defaultValue if param missing
        const val = mockParams[name];
        if (val === undefined) return defVal;
        return val;
    }
} as unknown as IExecuteFunctions;

try {
    const payload = constructPayload(context, 0);

    console.log('Generated Payload:', JSON.stringify(payload, null, 2));

    // Assertions
    if (payload.person1_ui.name !== 'Alice') throw new Error('Person 1 Name mismatch');
    if (payload.person2_ui.name !== 'Bob') throw new Error('Person 2 Name mismatch');

    // ACB Logic Check
    // P1: Explicit 15000
    if (payload.person1_ui.cost_basis !== 15000) throw new Error(`P1 Cost Basis mismatch: ${payload.person1_ui.cost_basis} (expected 15000)`);
    // P2: Default calc: 10000 * 0.90 = 9000
    if (payload.person2_ui.cost_basis !== 9000) throw new Error(`P2 Cost Basis mismatch: ${payload.person2_ui.cost_basis} (expected 9000)`);

    // Individualized Assumptions Check
    if (payload.person1_ui.lif_conversion_age !== 72) throw new Error('P1 LIF Age mismatch (should be 72)');
    if (payload.person2_ui.lif_conversion_age !== 71) throw new Error('P2 LIF Age default mismatch (should be 71)');

    // Global Setting Check
    if (payload.inputs.base_tfsa_amount !== 8000) throw new Error('Base TFSA global setting mismatch');

    // DB Pension Check
    if (payload.person1_ui.db_enabled !== true) throw new Error('Person 1 DB Pension enabled mismatch');
    if (payload.person1_ui.db_pension_income !== 20000) throw new Error('Person 1 DB Pension income mismatch');

    // Withdrawal Strategy Check
    const p1Strat = (payload.withdrawal_strategy.person1 as { weights: Array<{ order: string[] }> }).weights[0].order;
    if (p1Strat[0] !== 'tfsa' || p1Strat[1] !== 'rrsp') throw new Error(`Person 1 Withdrawal Strategy mismatch: ${p1Strat}`);

    // Monte Carlo Defaults Check
    if (payload.inputs.return_std_dev !== 0.09) throw new Error('Monte Carlo return_std_dev mismatch');
    if (payload.inputs.num_trials !== 1000) throw new Error('Monte Carlo num_trials mismatch');

    console.log('✅ TEST PASSED: Payload constructed correctly matching specific verification criteria.');
} catch (e) {
    console.error('❌ TEST FAILED:', e);
    // eslint-disable-next-line n8n/no-restricted-globals
    throw e;
}
*/
