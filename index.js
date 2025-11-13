// Helper: Generate a simple explanation for each violation
function generateExplanation(rule) {
  const { conditions = [], requirements = [] } = rule.json || {};

  const describeCond = (c) => {
    switch (c.field) {
      case "amount":
        return `Amount ${c.operator} ${c.value.toLocaleString()}`;
      case "businessForm":
        return `Business form ${c.operator === "=" ? "is" : "is not"} ${c.value}`;
      case "residualType":
        return `Residual type ${c.operator === "=" ? "must be" : "cannot be"} ${c.value}`;
      case "yield":
        return `Yield ${c.operator} ${c.value * 100}%`;
      default:
        return `${c.field} ${c.operator} ${c.value}`;
    }
  };

  const describeReq = (r) => {
    switch (r.field) {
      case "residualType":
        return `Residual type ${r.operator === "=" ? "must be" : "cannot be"} ${r.value}`;
      case "businessForm":
        return `Business form ${r.operator === "=" ? "must be" : "cannot be"} ${r.value}`;
      case "yield":
        return `Maximum yield allowed is ${(r.value * 100).toFixed(2)}%`;
      case "amount":
        return `Minimum amount requirement is $${r.value.toLocaleString()}`;
      default:
        return `${r.field} ${r.operator} ${r.value}`;
    }
  };

  const condText = conditions.length ? conditions.map(describeCond).join(" AND ") : "";
  const reqText = requirements.length ? requirements.map(describeReq).join(" AND ") : "";

  if (condText && reqText) return `${condText}. ${reqText}.`;
  if (reqText) return `${reqText}.`;
  if (condText) return `${condText}.`;
  return "Deal did not meet the stated guideline.";
}

// Evaluate endpoint with notes
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
        const notes = generateExplanation(rule);
        console.warn(`❌ Rule violated: "${rule.text}" → ${notes}`);
        violations.push({ rule: rule.text, notes });
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
