// index.js
import express from "express";
import fs from "fs";

console.log("🔥 Server started — index.js JSON version is running");

const app = express();
app.use(express.json());

// In-memory rules cache
let rulesByState = {};
const RULES_FILE_PATH = "./pricing-rules.json"; // ✨ Updated to match your filename

// 🧮 Utility: safely evaluate conditions
function evaluateCondition(cond, deal) {
  const val = deal[cond.field];
  if (val == null) {
    console.warn(`⚠️ Missing field '${cond.field}' in deal:`, deal);
    return false;
  }

  // Handle string comparisons more carefully
  let left, right;
  
  if (typeof val === "string" && typeof cond.value === "string") {
    // For string fields like businessForm, residualType - do case-insensitive comparison
    left = val.trim().toLowerCase();
    right = cond.value.trim().toLowerCase();
  } else {
    // For numeric fields, ensure both are numbers
    left = typeof val === "string" ? parseFloat(val) : val;
    right = typeof cond.value === "string" ? parseFloat(cond.value) : cond.value;
  }

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
      console.warn(`⚠️ Unknown operator: ${cond.operator}`);
      result = false;
  }

  console.log(
    `🧩 Evaluating [${cond.field} ${cond.operator} ${cond.value}] -> ${
      result ? "✅ PASS" : "❌ FAIL"
    } (deal value: ${val}, compared as: ${left} vs ${right})`
  );
  return result;
}

// 📄 Load rules from JSON file
function loadRules() {
  return new Promise((resolve) => {
    console.log("📁 Files in working directory:", fs.readdirSync("./"));
    console.log("📄 Looking for:", RULES_FILE_PATH);

    if (!fs.existsSync(RULES_FILE_PATH)) {
      console.error("❌ Rules file not found:", RULES_FILE_PATH);
      rulesByState = {};
      resolve();
      return;
    }

    try {
      console.log(`📂 Loading pricing rules from: ${RULES_FILE_PATH}`);
      const rawData = fs.readFileSync(RULES_FILE_PATH, 'utf8');
      const rulesData = JSON.parse(rawData);
      
      rulesByState = rulesData.states;
      
      const totalStates = Object.keys(rulesByState).length;
      const totalRules = Object.values(rulesByState).flat().length;
      console.log(`✅ Loaded ${totalStates} states with ${totalRules} total rules`);
      
      // Debug: Show loaded rules structure
      console.log("📋 Rules loaded by state:");
      Object.entries(rulesByState).forEach(([state, rules]) => {
        console.log(`   ${state}: ${rules.length} rule(s)`);
        rules.forEach(rule => {
          console.log(`     - ${rule.id}: ${rule.conditions.length} condition(s), ${rule.requirements.length} requirement(s)`);
        });
      });
      
      resolve();
    } catch (err) {
      console.error("❌ Error loading JSON rules:", err.message);
      rulesByState = {};
      resolve();
    }
  });
}

// 🧠 Helper: Generate human-readable explanation for violations
function generateExplanation(rule) {
  const { conditions = [], requirements = [] } = rule;

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
      case "points":
        return `Points ${c.operator} ${(c.value * 100).toFixed(2)}%`;
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
      case "points":
        return `Maximum points allowed is ${(r.value * 100).toFixed(2)}%`;
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

// ✨ NEW: Helper functions to format guidelines for display
function formatConditionsForDisplay(conditions) {
  if (!conditions || conditions.length === 0) {
    return "Applies to all deals";
  }
  
  const conditionTexts = conditions.map(cond => {
    switch (cond.field) {
      case "amount":
        return `Amount ${cond.operator} $${cond.value.toLocaleString()}`;
      case "businessForm":
        return `Business form ${cond.operator === "=" ? "is" : "is not"} ${cond.value}`;
      case "residualType":
        return `Residual type ${cond.operator === "=" ? "is" : "is not"} ${cond.value}`;
      case "yield":
        return `Yield ${cond.operator} ${(cond.value * 100).toFixed(1)}%`;
      case "points":
        return `Points ${cond.operator} ${(cond.value * 100).toFixed(1)}%`;
      default:
        return `${cond.field} ${cond.operator} ${cond.value}`;
    }
  });
  
  return conditionTexts.join(" AND ");
}

function formatRequirementsForDisplay(requirements) {
  if (!requirements || requirements.length === 0) {
    return "No specific requirements";
  }
  
  const reqTexts = requirements.map(req => {
    switch (req.field) {
      case "amount":
        return `Minimum amount: $${req.value.toLocaleString()}`;
      case "businessForm":
        return `Business form ${req.operator === "=" ? "must be" : "cannot be"} ${req.value}`;
      case "residualType":
        return `Residual type ${req.operator === "=" ? "must be" : "cannot be"} ${req.value}`;
      case "yield":
        return `Maximum yield: ${(req.value * 100).toFixed(1)}%`;
      case "points":
        return `Maximum points: ${(req.value * 100).toFixed(1)}%`;
      default:
        return `${req.field} ${req.operator} ${req.value}`;
    }
  });
  
  return reqTexts.join(" AND ");
}

// ⚙️ ENHANCED Evaluate endpoint - REPLACES the original one
app.post("/evaluate", (req, res) => {
  const { state, amount, businessForm, residualType, yield: dealYield, points } =
    req.body;

  console.log("---------------------------------------------------------");
  console.log(`🔍 Evaluation request received for state: ${state}`);
  console.log("Deal payload:", {
    amount,
    businessForm,
    residualType,
    yield: dealYield,
    points,
  });

  if (!state) {
    return res.status(400).json({ error: "Missing required field: state" });
  }

  const upperState = state.toUpperCase();
  const rules = rulesByState[upperState] || [];
  const violations = [];
  const applicableGuidelines = []; // ✨ NEW: Track all guidelines for this state

  if (rules.length === 0) {
    console.warn(`⚠️ No rules found for state: ${upperState}`);
  }

  for (const rule of rules) {
    console.log(`🧠 Checking rule: "${rule.text}"`);
    
    const { conditions = [], requirements = [] } = rule;

    // ✨ NEW: Format guideline for response (regardless of violation status)
    const guideline = {
      id: rule.id,
      text: rule.text,
      conditions: formatConditionsForDisplay(conditions),
      requirements: formatRequirementsForDisplay(requirements),
      appliesTo: conditions.length > 0 ? "Conditional" : "All deals"
    };
    applicableGuidelines.push(guideline);

    console.log("Conditions for this rule:", conditions);
    console.log("Requirements for this rule:", requirements);

    const conditionsMet = conditions.every((c) =>
      evaluateCondition(c, {
        amount,
        businessForm,
        residualType,
        yield: dealYield,
        points, // ✨ NEW: Include points in evaluation
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
            points, // ✨ NEW: Include points in evaluation
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
    } else {
      console.log(`⏩ Rule skipped (conditions not met): "${rule.text}"`);
    }
  }

  console.log(`📊 Evaluation complete: ${violations.length} violation(s) found.`);
  console.log("---------------------------------------------------------");

  // ✨ ENHANCED RESPONSE: Include guidelines
  res.json({
    state: upperState,
    violationCount: violations.length,
    violations,
    guidelines: applicableGuidelines, // ✨ NEW: All applicable guidelines
    evaluationSummary: {
      totalRules: rules.length,
      rulesEvaluated: applicableGuidelines.length,
      rulesPassed: applicableGuidelines.length - violations.length,
      rulesViolated: violations.length
    }
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
