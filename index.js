// index.js
import express from "express";
import fs from "fs";
import csv from "csv-parser";

const app = express();
app.use(express.json());

// In-memory rules cache
let rulesByState = {};
const RULES_FILE_PATH = "./rules/pricingGuidelines_with_JSON.csv"; // ✅ match your repo folder

// Utility: safely evaluate conditions
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

// Load rules into memory from CSV
function loadRules() {
  return new Promise((resolve) => {
    const filePath = RULES_FILE_PATH;

    if (!fs.existsSync(filePath)) {
      console.error("❌ Rules file not found:", filePath);
      rulesByState = {}; // clear existing
      resolve();
      return;
    }

    const localRules = {};

    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => {
        const state = row.State__c?.trim()?.toUpperCase();
        if (!state) return;

        let jsonData = {};
        try {
          jsonData = JSON.parse(row.Rule_JSON__c || "{}");
        } catch {
          console.warn("⚠️ Invalid JSON for state:", state);
        }

        const rule = {
          text: row.Guideline_Text__c,
          json: jsonData
        };

        if (!localRules[state]) localRules[state] = [];
        localRules[state].push(rule);
      })
      .on("end", () => {
        rulesByState = localRules;
        console.log(
          `✅ Loaded ${Object.keys(rulesByState).length} states with ${
            Object.values(rulesByState).flat().length
          } total rules`
        );
        resolve();
      })
      .on("error", (err) => {
        console.error("❌ Error loading CSV:", err.message);
        resolve();
      });
  });
}

// Evaluate endpoint
app.post("/evaluate", (req, res) => {
  const { state, amount, businessForm, residualType, yield: dealYield } = req.body;

  if (!state) {
    return res.status(400).json({ error: "Missing required field: state" });
  }

  const upperState = state.toUpperCase();
  const rules = rulesByState[upperState] || [];
  const violations = [];

  for (const rule of rules) {
    const { conditions, requirements } = rule.json;

    // Only check requirements if all conditions are met
    const conditionsMet = (conditions || []).every((c) =>
      evaluateCondition(c, { amount, businessForm, residualType, yield: dealYield })
    );

    if (conditionsMet) {
      const violated = (requirements || []).some(
        (r) => !evaluateCondition(r, { amount, businessForm, residualType, yield: dealYield })
      );

      if (violated) {
        violations.push({ rule: rule.text });
      }
    }
  }

  res.json({
    state: upperState,
    violationCount: violations.length,
    violations
  });
});

// ✅ Admin endpoint to reload CSV without redeploying
app.post("/reload", async (req, res) => {
  console.log("♻️ Reloading pricing rules...");
  await loadRules();
  res.json({
    message: "Rules reloaded successfully",
    statesLoaded: Object.keys(rulesByState).length
  });
});

// Health check (Render pings this)
app.get("/", (req, res) => {
  res.send("✅ Pricing Guideline Engine is running");
});

// Start server
await loadRules();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`⚡ Pricing Guideline Engine running on port ${PORT}`);
});
