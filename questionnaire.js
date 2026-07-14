// ════════════════════════════════════════════════════════════
//  Love Life HQ — Structured Questionnaire Definitions
//  Loaded into index.html via <script src="questionnaire.js">
// ════════════════════════════════════════════════════════════

// Phase 2: Structured questionnaire — 10 targeted questions
// across the 6 compatibility criteria. Each has a `key` (saved
// to DB), a `label`, a `criterion` it maps to, and an input `type`.
const QUESTIONNAIRE = [
  {
    key: 'communication_style',
    criterion: 'Communication',
    label: 'How does she communicate?',
    type: 'choice',
    options: ['Very open & expressive', 'Selective — opens up over time', 'Reserved / closed off', "Don't know yet"]
  },
  {
    key: 'response_pattern',
    criterion: 'Communication',
    label: 'How quickly/consistently does she respond to you?',
    type: 'choice',
    options: ['Quick & consistent', 'Sometimes slow but reliable', 'Inconsistent / hot and cold', "Haven't noticed a pattern"]
  },
  {
    key: 'shared_values',
    criterion: 'Values',
    label: 'Does she share your core values (faith, family, lifestyle)?',
    type: 'choice',
    options: ['Yes, strongly aligned', 'Somewhat aligned', 'Different but compatible', 'Conflicting', 'Too early to tell']
  },
  {
    key: 'ambition_level',
    criterion: 'Values',
    label: 'How ambitious / driven is she?',
    type: 'slider',
    min: 1, max: 5,
    labels: ['Not very driven', 'Extremely driven']
  },
  {
    key: 'attraction_level',
    criterion: 'Attraction',
    label: 'How physically/romantically attracted are you to her?',
    type: 'slider',
    min: 1, max: 5,
    labels: ['Not much', 'Very attracted']
  },
  {
    key: 'mutual_interest',
    criterion: 'Attraction',
    label: 'Does she seem interested in you romantically?',
    type: 'choice',
    options: ['Clearly yes', 'Maybe / mixed signals', 'Seems platonic', "Can't tell"]
  },
  {
    key: 'natural_chemistry',
    criterion: 'Chemistry',
    label: 'How natural does conversation/energy feel between you two?',
    type: 'slider',
    min: 1, max: 5,
    labels: ['Forced / awkward', 'Effortless']
  },
  {
    key: 'future_goals_alignment',
    criterion: 'Future goals',
    label: 'What is she looking for right now?',
    type: 'choice',
    options: ['Something serious / long-term', 'Casual / not sure yet', 'Focused on herself / not looking', "Haven't discussed it"]
  },
  {
    key: 'fun_factor',
    criterion: 'Fun factor',
    label: 'How fun / enjoyable is time spent with her?',
    type: 'slider',
    min: 1, max: 5,
    labels: ['Not very fun', 'Really fun']
  },
  {
    key: 'red_flags',
    criterion: 'Values',
    label: 'Any of these noticed so far?',
    type: 'multi',
    options: ['Inconsistency', 'Avoids deep conversations', 'Talks about exes a lot', 'Flaky / cancels often', 'Seems to be talking to others too', 'None noticed']
  },
];

// Phase 3: Scenario question bank — used as fallback or seed
// if AI generation fails or API key isn't set. The AI normally
// generates a custom question based on each new log entry.
const SCENARIO_FALLBACK_QUESTIONS = [
  "How did she initiate or respond during this interaction?",
  "Did anything about how she acted concern you, even slightly?",
  "Did she ask about your life, or was it mostly one-sided?",
  "How did you feel in the moments right after this happened?",
  "Was there a moment that felt particularly genuine or particularly off?",
  "Did she follow through on anything she said she would do?",
];

if (typeof module !== 'undefined') {
  module.exports = { QUESTIONNAIRE, SCENARIO_FALLBACK_QUESTIONS };
}
