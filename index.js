// index.js
import express from "express";
import fs from "fs";
import csv from "csv-parser";

console.log("🔥 Server started — index.js debug version is running");

const app = express();
app.use(express.json());

// In-memory rules cache
let rulesByState = {};
const RULES_FILE_PATH = "./pricingGuidelines_with_JSON.csv"; // file is in project root

// 🧮 Utility: safely evaluate conditions
function evaluateCondition(cond, deal) {
  const val = deal[cond.field];
  if (val == null) {
    console.warn(`⚠️ Missing field '${cond.field}' in deal:`, deal);
    return false;
  }

  const left = typeof val === "string" ? val.trim().toLowerCase() : val;
  const right =
    typeof cond.value === "string"
      ? cond.value.trim().toLowerCase()
      : cond.value;

  let result;
  switch (cond.operator) {
    case "=":
      result = left === right;
      break;
    case "!=":
      result = left !== right;
      break;
    case "<":
      result = left < right;
      break;
    case "<=":
      result = left <= right;
      break;
    case ">":
      result = left > right;
      break;
    case ">=":
      result = left >= right;
      break;
    default:
      result = false;
  }

  console.log(
    `🧩 Evaluating [${cond.field} ${cond.operator} ${cond.value}] -> ${
      result ? "✅ PASS" : "❌ FAIL"
    } (deal value: ${val})`
  );
  return result;
}

// 📄 Load rules into memory from CSV



function loadRules() {
  return new Promise((resolve) => {
    const filePath = RULES_FILE_PATH;

    // Put logs ONLY AFTER filePath is defined
    console.log("📁 Files in working directory:", fs.readdirSync("./"));
    console.log("📄 Looking for:", filePath);

    if (!fs.existsSync(filePath)) {
      console.error("❌ Rules file not found:", filePath);
      rulesByState = {};
      resolve();
      return;
    }

    const localRules = {};
    console.log(`📂 Loading pricing rules from: ${filePath}`);

    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => {
        // 🔍 DEBUG — LOG THE HEADERS AND RAW JSON CELL
        console.log("CSV HEADERS I SEE:", Object.keys(row));
        console.log("RAW JSON CELL:", row.Rule_JSON__c);

        const state = row.State__c?.trim()?.toUpperCase();
        if (!state) return;

        let jsonData = {};

        const rawCell = row.Rule_JSON__c;
        console.log(`RAW CSV JSON CELL for ${state}:`, rawCell);

        try {
          let raw = rawCell?.trim() || "{}";

          raw = raw.replace(/^"|"$/g, "");   // remove outer quotes
          raw = raw.replace(/""/g, '"');     // unescape double quotes

          jsonData = JSON.parse(raw);
        } catch (err) {
          console.warn(`⚠️ Invalid JSON for ${state}:`, err.message);
          console.warn("RAW VALUE WAS:", rawCell);
          jsonData = {};
        }

        const rule = {
          id: row.Guideline__c,
          text: row.Guideline__c,
          json: jsonData,
        };

        if (!localRules[state]) localRules[state] = [];
        localRules[state].push(rule);
      })
      .on("end", () => {
        rulesByState = localRules;
        const totalStates = Object.keys(rulesByState).length;
        const totalRules = Object.values(rulesByState).flat().length;
        console.log(`✅ Loaded ${totalStates} states with ${totalRules} total rules`);

        resolve();
      })
      .on("error", (err) => {
        console.error("❌ Error loading CSV:", err.message);
        resolve();
      });
  });
}


// 🧠 Helper: Generate human-readable explanation for violations
function generateExplanation(rule) {
  const { conditions = [], requirements = [] } = rule.json || {};

  const describeCond = (c) => {
    switch (c.field) {
      case "amount":
        return `Amount ${c.operator} ${c.value.toLocaleString()}`;
      case "businessForm":
        return `Business form ${
          c.operator === "=" ? "is" : "is not"
        } ${c.value}`;
      case "residualType":
        return `Residual type ${
          c.operator === "=" ? "must be" : "cannot be"
        } ${c.value}`;
      case "yield":
        return `Yield ${c.operator} ${(c.value * 100).toFixed(2)}%`;
      default:
        return `${c.field} ${c.operator} ${c.value}`;
    }
  };

  const describeReq = (r) => {
    switch (r.field) {
      case "residualType":
        return `Residual type ${
          r.operator === "=" ? "must be" : "cannot be"
        } ${r.value}`;
      case "businessForm":
        return `Business form ${
          r.operator === "=" ? "must be" : "cannot be"
        } ${r.value}`;
      case "yield":
        return `Maximum yield allowed is ${(r.value * 100).toFixed(2)}%`;
      case "amount":
        return `Minimum amount requirement is $${r.value.toLocaleString()}`;
      default:
        return `${r.field} ${r.operator} ${r.value}`;
    }
  };

  const condText = conditions.length
    ? conditions.map(describeCond).join(" AND ")
    : "";
  const reqText = requirements.length
    ? requirements.map(describeReq).join(" AND ")
    : "";

  if (condText && reqText) return `${condText}. ${reqText}.`;
  if (reqText) return `${reqText}.`;
  if (condText) return `${condText}.`;
  return "Deal did not meet the stated guideline.";
}

// ⚙️ Evaluate endpoint
app.post("/evaluate", (req, res) => {
  const { state, amount, businessForm, residualType, yield: dealYield } =
    req.body;

  console.log("---------------------------------------------------------");
  console.log(`🔍 Evaluation request received for state: ${state}`);
  console.log("Deal payload:", {
    amount,
    businessForm,
    residualType,
    yield: dealYield,
  });

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
    const { conditions = [], requirements = [] } = rule.json || {};

    console.log("Conditions for this rule:", conditions);

    const conditionsMet = conditions.every((c) =>
      evaluateCondition(c, {
        amount,
        businessForm,
        residualType,
        yield: dealYield,
      })
    );

    console.log(`   → Conditions met: ${conditionsMet}`);

    if (conditionsMet) {
      const violated = requirements.some(
        (r) =>
          !evaluateCondition(r, {
            amount,
            businessForm,
            residualType,
            yield: dealYield,
          })
      );

      if (violated) {
        const notes = generateExplanation(rule);

        violations.push({
          ruleId: rule.id,
          rule: rule.text,
          notes: `In the state of ${upperState}, ${notes}`,
        });

        console.warn(`❌ Rule violated: "${rule.text}"`);
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
    violations,
  });
});

// 🔄 Reload endpoint
app.post("/reload", async (req, res) => {
  console.log("♻️ Reloading pricing rules...");
  await loadRules();
  res.json({
    message: "Rules reloaded successfully",
    statesLoaded: Object.keys(rulesByState).length,
  });
});

// 🩺 Health check endpoint
app.get("/", (req, res) => {
  res.send("✅ Pricing Guideline Engine is running");
});

// 🚀 Start server
await loadRules();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`⚡ Pricing Guideline Engine running on port ${PORT}`);
});
