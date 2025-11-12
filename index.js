// index.js
import express from "express";
import fs from "fs";
import csv from "csv-parser";

const app = express();
app.use(express.json());

// In-memory rules cache
let rulesByState = {};
const RULES_FILE_PATH = "./pricingGuidelines_with_JSON.csv"; // file is in project root

// Utility: safely evaluate conditions
function evaluateCondition(cond, deal) {
  const val = deal[cond.field];
  if (val == null) {
    console.warn(`⚠️ Missing field '${cond.field}' in deal:`, deal);
    return false;
  }

  // normalize case for string comparisons
  const left = typeof val === "string" ? val.trim().toLowerCase() : val;
  const right = typeof cond.value === "string" ? cond.value.trim().toLowerCase() : cond.value;

  let result;
  switch (cond.operator) {
    case "=":  result = left === right; break;
    case "!=": result = left !== right; break;
    case "<":  result = left < right; break;
    case "<=": result = left <= right; break;
    case ">":  result = left > right; break;
    case ">=": result = left >= right; break;
    default:   result = false;
  }

  console.log(`🧩 Evaluating [${cond.field} ${cond.operator} ${cond.value}] -> ${result ? "✅ PASS" : "❌ FAIL"} (deal value: ${val})`);
  return result;
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
    console.log(`📂 Loading pricing rules from: ${filePath}`);

    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => {
        const state = row.State__c?.trim()?.toUpperCase();
        if (!state) return;

        let jsonData = {};
        try {
          jsonData = JSON.parse(row.Rule_JSON__c || "{}");
        } catch (err) {
          console.warn(`⚠️ Invalid JSON for ${state}: ${err.message}`);
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
        const totalStates = Object.keys(rulesByState).length;
        const totalRules = Object.values(rulesByState).flat().length;
        console.log(`✅ Loaded ${totalStates} states with ${totalRules} total rules`);

        // Log each state's summary
        for (const [state, rules] of Object.entries(rulesByState)) {
          console.log(`🗺️ ${state} → ${rules.length} rule(s)`);
          for (const rule of rules) {
            console.log(`   • ${rule.text}`);
          }
        }

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

  console.log("---------------------------------------------------------");
  console.log(`🔍 Evaluation request received for state: ${state}`);
  console.log("Deal payload:", { amount, businessForm, residualType, yield: dealYield });

  if (!state) {
    return res.status(400).json({ error: "Missing required field: state" });
  }

  const upperState = state.toUpperCase();
  const rules = rulesByState[upperState] || [];
  const violations = [];

  if (rules.length === 0) {
    console.warn(`⚠️ No rules found for state: ${upperState}`);
  }

  for (const rule of rules) {
    console.log(`🧠 Checking rule: "${rule.text}"`);
    const { conditions, requirements } = rule.json || {};

    // Evaluate conditions
    const conditionsMet = (conditions || []).every((c) =>
      evaluateCondition(c, { amount, businessForm, residualType, yield: dealYield })
    );
    console.log(`   → Conditions met: ${conditionsMet}`);

    // Evaluate requirements
    if (conditionsMet) {
      const violated = (requirements || []).some(
        (r) => !evaluateCondition(r, { amount, businessForm, residualType, yield: dealYield })
      );

      if (violated) {
        console.warn(`❌ Rule violated: "${rule.text}"`);
        violations.push({ rule: rule.text });
      } else {
        console.log(`✅ Rule passed: "${rule.text}"`);
      }
    }
  }

  console.log(`📊 Evaluation complete: ${violations.length} violation(s) found.`);
  console.log("---------------------------------------------------------");

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

// Health check endpoint
app.get("/", (req, res) => {
  res.send("✅ Pricing Guideline Engine is running");
});

// Start server
await loadRules();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`⚡ Pricing Guideline Engine running on port ${PORT}`);
});
