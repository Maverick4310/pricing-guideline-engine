import express from "express";
import fs from "fs";
import csv from "csv-parser";

const app = express();
app.use(express.json());

const rulesByState = {}; // in-memory cache

// Load rules from CSV
function loadRules() {
  return new Promise((resolve) => {
    fs.createReadStream("./rules/pricingGuidelines_with_JSON.csv")
      .pipe(csv())
      .on("data", (row) => {
        const state = row.State__c?.trim();
        if (!state) return;
        const rule = {
          text: row.Guideline_Text__c,
          json: JSON.parse(row.Rule_JSON__c || "{}")
        };
        if (!rulesByState[state]) rulesByState[state] = [];
        rulesByState[state].push(rule);
      })
      .on("end", () => {
        console.log("✅ Loaded pricing guidelines for", Object.keys(rulesByState).length, "states");
        resolve();
      });
  });
}

// Evaluation helper
function evaluateCondition(cond, deal) {
  const val = deal[cond.field];
  switch (cond.operator) {
    case "=": return val == cond.value;
    case "!=": return val != cond.value;
    case "<": return val < cond.value;
    case "<=": return val <= cond.value;
    case ">": return val > cond.value;
    case ">=": return val >= cond.value;
    default: return false;
  }
}

// API Endpoint: Evaluate deal
app.post("/evaluate", (req, res) => {
  const { state, amount, businessForm, residualType, yield: dealYield } = req.body;

  if (!state) return res.status(400).json({ error: "Missing required field: state" });

  const rules = rulesByState[state.toUpperCase()] || [];
  const violations = [];

  for (const rule of rules) {
    const { conditions, requirements } = rule.json;
    const conditionsMet = (conditions || []).every(c =>
      evaluateCondition(c, { amount, businessForm, residualType, yield: dealYield })
    );

    if (conditionsMet) {
      const violated = (requirements || []).some(r =>
        !evaluateCondition(r, { amount, businessForm, residualType, yield: dealYield })
      );

      if (violated) violations.push({ rule: rule.text });
    }
  }

  res.json({ state, violationCount: violations.length, violations });
});

// Start server after loading rules
await loadRules();
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`⚡ Pricing Rule Engine running on port ${port}`));
