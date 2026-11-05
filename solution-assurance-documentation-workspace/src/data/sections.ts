import type { SectionDefinition } from '../types/assessment'

const notSelected = { value: '', label: 'Not selected' }
const notDetermined = { value: 'NOT_DETERMINED', label: 'Not determined' }

export const sections: SectionDefinition[] = [
  {
    id: 'setup',
    number: '00',
    title: 'Record setup',
    shortTitle: 'Setup',
    description: 'Identify the solution and connect this record to existing governance references when they already exist.',
    guidance: 'Create only the record you can support now. Saidot and Engine references are optional identifiers, not integrations.',
    fields: [
      { id: 'solutionName', label: 'Solution name', help: 'Use the name by which the solution is known in the governance process.', type: 'text', core: true, placeholder: 'e.g. Customer service drafting assistant' },
      { id: 'recordOwner', label: 'Record owner', help: 'The person responsible for keeping this documentation current.', type: 'text', core: true, placeholder: 'Name or role' },
      { id: 'businessUnit', label: 'Business unit or customer context', help: 'Identify the organisational or customer context without adding unnecessary confidential detail.', type: 'text', placeholder: 'Unit, programme or customer context' },
      { id: 'lifecycleStage', label: 'Current lifecycle stage', help: 'Select the stage that best reflects the information available today.', type: 'select', core: true, options: [notSelected,
        { value: 'QUALIFICATION_REGISTRATION', label: 'Qualification & Registration' },
        { value: 'DESIGN_DEVELOPMENT', label: 'Design & Development' },
        { value: 'VERIFICATION_VALIDATION', label: 'Verification & Validation' },
        { value: 'DEPLOYMENT', label: 'Deployment' },
        { value: 'OPERATION_MONITORING', label: 'Operation & Monitoring' },
        { value: 'REVIEW_REEVALUATION', label: 'Review / Re-evaluation' },
        { value: 'RETIREMENT', label: 'Retirement' },
      ] },
      { id: 'saidotReference', label: 'Saidot system reference', help: 'Optional inventory ID or link used to relate this summary to Saidot manually.', type: 'text', placeholder: 'Optional ID or reference' },
      { id: 'engineReference', label: 'Solution Assurance Engine reference', help: 'Optional case or assessment ID for later manual association.', type: 'text', placeholder: 'Optional case reference' },
    ],
  },
  {
    id: 'purpose',
    number: '01',
    title: 'Define intended use and output role',
    shortTitle: 'Purpose',
    description: 'Make the solution’s purpose, boundaries and the role of its output explicit before discussing assurance depth.',
    guidance: 'Describe what actually happens in the process. A recommendation is not a decision, and a decision is not an executed action.',
    fields: [
      { id: 'intendedPurpose', label: 'Intended purpose', help: 'What problem does the solution address, and what is it intended to achieve?', type: 'textarea', core: true, placeholder: 'Describe the intended use in concrete terms…' },
      { id: 'useContext', label: 'Process and use context', help: 'Where in the business or customer process is the output produced and used?', type: 'textarea', placeholder: 'Describe the surrounding process and trigger…' },
      { id: 'users', label: 'Users and operators', help: 'Who configures, operates or directly uses the solution?', type: 'text', placeholder: 'Roles or groups' },
      { id: 'affectedParties', label: 'Affected parties', help: 'Who may be affected by the output, including people who never use the solution directly?', type: 'text', core: true, placeholder: 'Customers, employees, partners or other parties' },
      { id: 'outputRole', label: 'Output role', help: 'Select the strongest role the output is intended to have. Do not infer permission from this selection.', type: 'select', core: true, options: [notSelected,
        { value: 'DRAFT', label: 'Draft — content for further authoring' },
        { value: 'SUMMARY', label: 'Summary — condensed representation' },
        { value: 'RECOMMENDATION', label: 'Recommendation — input to a human decision' },
        { value: 'DECISION', label: 'Decision — determines an outcome' },
        { value: 'ACTION', label: 'Action — initiates or executes a change' },
      ] },
      { id: 'outputConsumers', label: 'Output and downstream use', help: 'What output is produced, who receives it, and where can it travel next?', type: 'textarea', placeholder: 'Output format, recipients and downstream systems…' },
      { id: 'humanAcceptance', label: 'Human review and acceptance', help: 'Who reviews or accepts the output, at what point, and what can they change or reject?', type: 'textarea', core: true, placeholder: 'Describe the actual review and authority arrangement…' },
      { id: 'exclusions', label: 'Exclusions and prohibited uses', help: 'State known out-of-scope uses, assumptions and boundaries.', type: 'textarea', placeholder: 'Uses, populations, environments or decisions that are excluded…' },
    ],
  },
  {
    id: 'impact',
    number: '02',
    title: 'Assess impact and record risk context',
    shortTitle: 'Impact',
    description: 'Describe potential consequences and record any classification that has already been made elsewhere.',
    guidance: 'This draft does not calculate solution risk or AI Act classification. Keep those outcomes separate and cite their actual source.',
    fields: [
      { id: 'consequences', label: 'Plausible adverse consequences', help: 'What could happen if the output is wrong, misleading, unavailable, misused or acted upon too late?', type: 'textarea', core: true, placeholder: 'Describe credible consequences and affected parties…' },
      { id: 'severity', label: 'Consequence severity', help: 'Record the current judgement or leave it undetermined.', type: 'select', options: [notDetermined,
        { value: 'LOW', label: 'Low' }, { value: 'MODERATE', label: 'Moderate' }, { value: 'HIGH', label: 'High' }, { value: 'SEVERE', label: 'Severe' },
      ] },
      { id: 'detectability', label: 'Detectability before harm', help: 'How readily could a problem be detected before consequences occur?', type: 'select', options: [notDetermined,
        { value: 'READILY_DETECTABLE', label: 'Readily detectable' }, { value: 'PARTIALLY_DETECTABLE', label: 'Partially detectable' }, { value: 'DIFFICULT', label: 'Difficult to detect' }, { value: 'NOT_DETECTABLE', label: 'Not detectable in current design' },
      ] },
      { id: 'reversibility', label: 'Reversibility', help: 'To what extent can the outcome and its effects be reversed?', type: 'select', options: [notDetermined,
        { value: 'REVERSIBLE', label: 'Reversible' }, { value: 'PARTIALLY_REVERSIBLE', label: 'Partially reversible' }, { value: 'DIFFICULT', label: 'Difficult to reverse' }, { value: 'IRREVERSIBLE', label: 'Irreversible' },
      ] },
      { id: 'scaleBeforeDetection', label: 'Scale before detection', help: 'How many outputs, people, records or transactions could be affected before detection?', type: 'text', placeholder: 'Estimate, range or not determined' },
      { id: 'propagation', label: 'Propagation and downstream dependency', help: 'Can the output be copied, reused, integrated or acted upon by other processes?', type: 'textarea', placeholder: 'Describe propagation paths and dependencies…' },
      { id: 'existingRisk', label: 'Existing solution risk or classification', help: 'Record an existing outcome only if it has been assigned elsewhere. Otherwise state not determined.', type: 'text', placeholder: 'Outcome and assessing process, or Not determined' },
      { id: 'classificationBasis', label: 'Classification basis and date', help: 'Identify the method, decision record, owner and date behind any existing classification.', type: 'textarea', placeholder: 'Source, method, decision owner and date…' },
    ],
  },
  {
    id: 'permission',
    number: '03',
    title: 'Confirm permission and establish data rules',
    shortTitle: 'Permission',
    description: 'Record whether the intended use is permitted, on what basis, and which data rules and uncertainties remain.',
    guidance: 'A documented permission statement is not legal approval. Identify the actual authority or source and keep unresolved constraints visible.',
    fields: [
      { id: 'permissionStatus', label: 'Current permission status', help: 'Record the current position without treating this tool as the permission authority.', type: 'select', core: true, options: [notDetermined,
        { value: 'PERMITTED', label: 'Permitted by an identified authority' },
        { value: 'CONDITIONALLY_PERMITTED', label: 'Conditionally permitted' },
        { value: 'NOT_PERMITTED', label: 'Not permitted' },
      ] },
      { id: 'permissionBasis', label: 'Permission basis and authority', help: 'Who or what establishes permission, under which conditions, and for what scope?', type: 'textarea', core: true, placeholder: 'Policy, contract, legal basis, decision owner and scope…' },
      { id: 'privacyConfidentiality', label: 'Privacy and confidentiality rules', help: 'What personal, confidential or otherwise protected information is involved, and which rules apply?', type: 'textarea', placeholder: 'Data categories, obligations and required safeguards…' },
      { id: 'contractualConstraints', label: 'Contracts and customer commitments', help: 'Record relevant contractual restrictions, commitments and approvals.', type: 'textarea', placeholder: 'Applicable terms, commitments, exceptions and references…' },
      { id: 'sensitiveDerivedData', label: 'Sensitive and derived data', help: 'Can inputs, outputs, logs, embeddings or inferred data create additional sensitivity?', type: 'textarea', placeholder: 'Describe derived artefacts and handling constraints…' },
      { id: 'minimization', label: 'Minimisation and retention', help: 'What data is necessary, what is excluded, and how long may inputs, outputs and logs be retained?', type: 'textarea', placeholder: 'Required data, exclusions, retention and deletion rules…' },
      { id: 'usageRights', label: 'Usage rights and permitted sources', help: 'What rights or terms permit each source to be used for this purpose?', type: 'textarea', placeholder: 'Licences, terms, ownership and permitted uses…' },
      { id: 'sourceQuality', label: 'Source quality, provenance and currency', help: 'How are origin, reliability, completeness and currency established?', type: 'textarea', placeholder: 'Known quality controls and limitations…' },
      { id: 'openConstraints', label: 'Unresolved permission questions', help: 'List unresolved issues and the person or role who can settle them.', type: 'textarea', placeholder: 'Question, impact and responsible authority…' },
    ],
  },
]

export const sectionMap = Object.fromEntries(sections.map((section) => [section.id, section])) as Record<SectionDefinition['id'], SectionDefinition>

export const documentationFields = sections.flatMap((section) => section.fields.map((field) => ({ ...field, sectionId: section.id })))

export const evidenceBasisLabels: Record<string, string> = {
  DECLARED: 'Declared', DOCUMENTED: 'Documented', IMPLEMENTED: 'Implemented', TESTED: 'Tested', OBSERVED: 'Operationally observed',
}

export const verificationLabels: Record<string, string> = {
  UNVERIFIED: 'Unverified', VERIFIED: 'Verified', CONTRADICTED: 'Contradicted', EXPIRED: 'Expired',
}

export const lifecycleLabels = Object.fromEntries(sections[0].fields.find((field) => field.id === 'lifecycleStage')?.options?.map((option) => [option.value, option.label]) ?? [])
