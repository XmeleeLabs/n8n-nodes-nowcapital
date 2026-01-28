# n8n-nodes-nowcapital

This is an n8n community node for integrating with the [NowCapital.ca](https://nowcapital.ca) Canadian Retirement Planning API. It allows you to automate retirement simulations, calculate sustainable spending, and perform risk analysis using Canadian tax laws.

[NowCapital](https://nowcapital.ca) is a specialized retirement planning tool designed for Canadians, handling RRSPs, TFSAs, CPP/OAS, and income splitting.

## Features

- **Calculate Sustainable Spend**: Find the maximum monthly amount you can safey spend throughout retirement.
- **Detailed Projections**: Get a year-by-year breakdown of account balances and cash flows.
- **Scenario Modeling**: Model specific spending targets to see how long your money will last.
- **Monte Carlo Simulations**: ⭐ *Premium*: Perform risk analysis to see the probability of success for your retirement plan.
- **Localized Tax Logic**: Specifically built for Canadian provinces and territories.

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

```bash
npm install n8n-nodes-nowcapital
```

## Credentials

You will need an API Key from NowCapital.ca:

1. Log in to your [NowCapital.ca](https://nowcapital.ca) account.
2. Navigate to the **API Access** section.
3. Generate a new API Key.
4. (Optional) A **Premium API Key** is required for Monte Carlo simulations and advanced event modeling.

## Operations

### Calculate Sustainable Spend
Optimizes for the highest possible monthly spend (inflation-adjusted) that results in a $0 balance at the end of the planning horizon.

### Get Detailed Projections
Provides the same calculation as above but returns a full array of yearly data, useful for creating charts or CSV records.

### Calculate Specific Spend
Models how your portfolio behaves with a fixed spending goal. Useful for "What if I spend $5,000/month?" scenarios.

### Run Monte Carlo Simulation (Premium)
Starts an asynchronous risk simulation. Returns a `taskId` which must be used with the **Get Simulation Status** operation to retrieve results.

---

## Technical Support
For issues with the hardware or API, visit [NowCapital.ca Support](https://nowcapital.ca).
For bugs specifically related to this n8n node, please open an issue on [GitHub](https://github.com/XmeleeLabs/n8n-nodes-nowcapital).

## License
[MIT](LICENSE.md)
