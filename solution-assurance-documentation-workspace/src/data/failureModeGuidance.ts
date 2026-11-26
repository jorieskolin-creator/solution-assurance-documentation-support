export type GuidanceTargetId =
  | 'failureModes'
  | 'severity_user'
  | 'occurrence_inherent'
  | 'detectability_inherent'
  | 'claimed_mitigations'

export interface FiveLayerFieldGuidance {
  id: GuidanceTargetId
  title: string
  essentialInstruction: string
  quickClarification: string
  detailedQuestions: {
    whatToRecord: string
    anchoredLevels: string[]
    whyNoRpn: string
    provenanceBoundary: string
    commonMistake: string
  }
}

export const failureModeGuidance: Record<GuidanceTargetId, FiveLayerFieldGuidance> = {
  failureModes: {
    id: 'failureModes',
    title: 'Failure Mode Register (Evidence-Gated FMEA)',
    essentialInstruction:
      'Record plausible ways this solution could fail, cause harm, or violate constraints, along with the controls claimed to prevent or detect each failure.',
    quickClarification:
      'Select an archetype preset (FM-01–FM-15) or add a custom failure mode (FM-CUSTOM-NN). Preset selection pre-fills controls and hints, but never chooses severity or confirms verification for you.',
    detailedQuestions: {
      whatToRecord:
        'Each row captures one distinct failure mode: its ID, title, trigger or cause, credible effect summary, anchored S/O/D judgements, mapped Solution Assurance objects (A1–F5 / AP-A1–AP-F5), and claimed mitigations with optional code/evidence references.',
      anchoredLevels: [
        'Severity (User): LOW / MEDIUM / HIGH / CRITICAL / UNKNOWN — impact if the failure reaches its outcome.',
        'Occurrence (Inherent): LOW / MEDIUM / HIGH / UNKNOWN — plausibility before claimed controls are credited.',
        'Detectability (Inherent): HIGH / MEDIUM / LOW / UNKNOWN — ease of spotting the failure before harm occurs.',
      ],
      whyNoRpn:
        'No S × O × D Risk Priority Number (RPN) is multiplied or calculated here. Multiplying ordinal labels hides CRITICAL low-probability harms behind arbitrary arithmetic; Solution Assurance gates inspect anchored levels and proof status directly.',
      provenanceBoundary:
        'Q1 (Defined): What you declare here or import from 02-Risk-and-Impact.md. Q2 (Code/Config): A code_ref path observed in a repo snapshot is not runtime proof. Q3 (Evidence): Only executed test/operational evidence satisfies Q3 in Solution Assurance Engine; NOT_RUN never counts as PASS.',
      commonMistake:
        'Treating a prompt instruction ("tell the model not to leak data") or an unexecuted test specification (NOT_RUN) as equivalent to a verified preventive technical control.',
    },
  },
  severity_user: {
    id: 'severity_user',
    title: 'Severity (Anchored User Judgement)',
    essentialInstruction:
      'Judge the worst credible consequence if this failure occurs without effective mitigation.',
    quickClarification:
      'Preset rows start as UNKNOWN until a human explicitly selects LOW, MEDIUM, HIGH, or CRITICAL.',
    detailedQuestions: {
      whatToRecord:
        'Select the anchored severity tier that reflects plausible harm to affected parties, confidentiality, safety, compliance, or operations.',
      anchoredLevels: [
        'LOW: Minor inconvenience or easily corrected formatting/draft issue; negligible downstream harm.',
        'MEDIUM: Material rework, local disruption, or bounded non-sensitive error with practical recovery.',
        'HIGH: Significant customer, operational, financial, or rights impact; difficult or costly recovery.',
        'CRITICAL: Severe, irreversible, systemic, cross-tenant confidentiality breach, safety, or legal harm.',
        'UNKNOWN: Not yet assessed — remains visible as an open review warning.',
      ],
      whyNoRpn:
        'CRITICAL and HIGH rows are evaluated on their own anchored severity and control strength rather than being diluted in an RPN product.',
      provenanceBoundary:
        'Severity is a Q1 human judgement recorded in Documentation Support. It does not assert AI Act classification or formal risk acceptance.',
      commonMistake:
        'Downgrading inherent severity because you assume a mitigation will always work — rate the consequence if the failure occurs.',
    },
  },
  occurrence_inherent: {
    id: 'occurrence_inherent',
    title: 'Inherent Occurrence (Before Control Credit)',
    essentialInstruction:
      'Estimate how plausible or frequent the trigger is in this architecture before crediting unverified controls.',
    quickClarification:
      'Rate inherent plausibility (LOW / MEDIUM / HIGH / UNKNOWN) based on exposure, untrusted inputs, and system design.',
    detailedQuestions: {
      whatToRecord:
        'How readily the trigger can occur in normal operation or adversarial use prior to verified preventive controls.',
      anchoredLevels: [
        'LOW: Unlikely under normal architecture; requires rare or tightly constrained conditions.',
        'MEDIUM: Plausible periodically under normal traffic, edge cases, or known workflow gaps.',
        'HIGH: Frequent or readily triggered (e.g., open-ended user/RAG text, unpinned dependencies, broad write access).',
        'UNKNOWN: Plausibility not yet evaluated.',
      ],
      whyNoRpn:
        'Kept separate from Severity and Detectability so high-severity, low-frequency failures still demand explicit preventive/detective backing.',
      provenanceBoundary:
        'Q1 declaration only; operational telemetry belongs in Q3 evidence.',
      commonMistake:
        'Marking occurrence LOW simply because a guardrail exists on paper when that guardrail has NOT_RUN or has no code reference.',
    },
  },
  detectability_inherent: {
    id: 'detectability_inherent',
    title: 'Inherent Detectability (Before Harm)',
    essentialInstruction:
      'Judge how easily a human or monitor would notice this failure before it causes downstream impact.',
    quickClarification:
      'Note the direction: HIGH detectability means easy to catch early; LOW detectability means silent or hard to spot before harm.',
    detailedQuestions: {
      whatToRecord:
        'Whether existing visibility, human review, or deterministic checks expose the failure prior to external impact.',
      anchoredLevels: [
        'HIGH: Readily detected immediately (e.g., deterministic schema rejection, explicit human verification step).',
        'MEDIUM: Detectable through targeted review or sampling, though some outputs may pass unnoticed.',
        'LOW: Silent or subtle (e.g., plausible hallucination, silent cross-tenant leak, gradual drift) until external harm occurs.',
        'UNKNOWN: Detectability not yet evaluated.',
      ],
      whyNoRpn:
        'LOW detectability warns reviewers that procedural review alone will likely miss the failure, without distorting scores with RPN multiplication.',
      provenanceBoundary:
        'Q1 assessment of observability design; actual monitoring alerts and logs are Q2/Q3 artefacts.',
      commonMistake:
        'Confusing "we have logs somewhere" with HIGH detectability before harm when nobody inspects them in time.',
    },
  },
  claimed_mitigations: {
    id: 'claimed_mitigations',
    title: 'Claimed Mitigations & Code / Evidence References',
    essentialInstruction:
      'List each preventive, detective, or procedural control claimed for this failure mode, along with honest code and evidence pointers.',
    quickClarification:
      'Keep Q1 (control description), Q2 (code_ref), and Q3 (evidence_ref & observed status) strictly separate. NOT_RUN never becomes PASS.',
    detailedQuestions: {
      whatToRecord:
        'Control description, mitigation type (PREVENTIVE, DETECTIVE, or PROCEDURAL_OR_PROMPT_ONLY), optional repository code path, optional evidence path/ID, and observed evidence status.',
      anchoredLevels: [
        'PREVENTIVE: Technical/architectural enforcement that blocks or constrains the failure path.',
        'DETECTIVE: Monitoring, assertion, test, or structured human check that surfaces failures reliably.',
        'PROCEDURAL_OR_PROMPT_ONLY: Policy text, training, or prompt instruction alone — flagged when used for HIGH/CRITICAL risks.',
      ],
      whyNoRpn:
        'Control type and evidence status drive honest gap flags directly (e.g., FM_HIGH_SEVERITY_WEAK_MITIGATION, FM_UNEXECUTED_EVIDENCE_REF).',
      provenanceBoundary:
        'DECLARED_IN_DOC = stated in text; OBSERVED_IN_CONFIG = code/config file path observed in snapshot (not runtime proof); TEST_EVIDENCE_LINKED = test result linked; NOT_RUN = specification only / not executed; MISSING_UNKNOWN = unresolved.',
      commonMistake:
        'Marking NOT_RUN test specifications as verified evidence or relying solely on prompt wording for HIGH/CRITICAL failure modes.',
    },
  },
}
