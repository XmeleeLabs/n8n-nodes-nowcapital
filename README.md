# n8n-nodes-nowcapital

This is an n8n community node for integrating with the [NowCapital.ca](https://nowcapital.ca) Canadian Retirement Planning API. It allows you to automate retirement simulations, calculate sustainable spending, and perform risk analysis using Canadian tax laws.

[NowCapital](https://nowcapital.ca) is a specialized retirement planning tool designed for Canadians, handling RRSPs, TFSAs, CPP/OAS, and income splitting.

## Features

- **Calculate Sustainable Spend**: Find the maximum monthly amount you can safely spend throughout retirement.
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

---

## Operations & Usage

### 📈 Calculate Sustainable Spend
Optimizes for the highest possible monthly spend (inflation-adjusted) that results in a $0 balance at the end of the planning horizon.

### 📊 Get Detailed Projections
Provides the same calculation as above but returns a full array of yearly data, useful for creating charts or CSV records.

### 🎯 Calculate Specific Spend
Models how your portfolio behaves with a fixed spending goal. Useful for "What if I spend $5,000/month?" scenarios.

### 🎲 Run Monte Carlo Simulation (Premium)
Starts a background risk simulation based on thousands of market scenarios. **This is an asynchronous operation.**

---

## 🔁 Handling Asynchronous Monte Carlo Simulations

Monte Carlo simulations are computationally intensive and take between 5 to 30 seconds to complete. To use this feature in n8n, you must implement a **Polling Loop**.

### Step-by-Step Polling Pattern

1. **Run Monte Carlo Simulation**: Use this node to start the task. It will return a `task_id` and a status of `PENDING`.
2. **Wait Node**: Connect a Wait node set to **5 seconds**.
3. **Get Simulation Status**: Connect a second NowCapital node. Use the `task_id` from the first node.
4. **IF Node**: Check if the status is equal to `SUCCESS`.
    - **Falsepath**: Route this back to the **Wait Node** (Step 2) to loop.
    - **Truepath**: Route this to the final node.
5. **Get Simulation Result**: Use a final NowCapital node with the same `task_id` to retrieve the completed math and success probability.

### Smart ID Handover
The NowCapital node includes built-in "Smart Handover" logic. If the backend switches task IDs during processing (from Orchestrator to Worker), the node will automatically detect this and follow the correct ID. You only ever need to pass the **original** `task_id` through your loop.

---

## Technical Support

For issues, visit [NowCapital.ca Support](https://nowcapital.ca).
For bugs specifically related to this n8n node, please open an issue on [GitHub](https://github.com/XmeleeLabs/n8n-nodes-nowcapital).

## License
[MIT](LICENSE.md)
