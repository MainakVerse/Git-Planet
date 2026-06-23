export type GitGptFeatureScope = 'repo' | 'user' | 'query'

export interface GitGptFeature {
  slug: string
  label: string
  group: string
  route: string
  page: string
  scope: GitGptFeatureScope
  aliases: string[]
}

export const GIT_GPT_FEATURES: GitGptFeature[] = [
  { slug: 'architecture', label: 'Auto Architecture Diagram', group: 'Repository Profiler', route: 'architecture', page: '/dashboard/architecture', scope: 'repo', aliases: ['arch', 'diagram', 'auto-architecture-diagram'] },
  { slug: 'dependency-graph', label: 'Dependency Grapher', group: 'Repository Profiler', route: 'dependency-graph', page: '/dashboard/dependency-graph', scope: 'repo', aliases: ['dependencies', 'deps', 'dependency-grapher'] },
  { slug: 'code-quality', label: 'Code Quality Analyser', group: 'Repository Profiler', route: 'code-quality', page: '/dashboard/code-quality', scope: 'repo', aliases: ['quality', 'code-quality-analyser', 'code-quality-analyzer'] },
  { slug: 'dead-code', label: 'Dead Code Extractor', group: 'Repository Profiler', route: 'dead-code', page: '/dashboard/dead-code', scope: 'repo', aliases: ['dead', 'unused', 'dead-code-extractor'] },
  { slug: 'readme', label: 'Repo Readme Maker', group: 'Repository Profiler', route: 'readme', page: '/dashboard/readme-maker', scope: 'repo', aliases: ['readme-maker', 'repo-readme-maker'] },
  { slug: 'wiki', label: 'Wiki Generator', group: 'Repository Profiler', route: 'wiki', page: '/dashboard/wiki-generator', scope: 'repo', aliases: ['wiki-generator'] },

  { slug: 'developer-intelligence', label: 'Developer Intelligence Score', group: 'Developer Intelligence', route: 'dis', page: '/dashboard/developer-intelligence-score', scope: 'user', aliases: ['dis', 'developer-intelligence-score'] },
  { slug: 'style-fingerprint', label: 'Coding Style Fingerprint', group: 'Developer Intelligence', route: 'style-fingerprint', page: '/dashboard/style-fingerprint', scope: 'repo', aliases: ['style', 'coding-style-fingerprint'] },
  { slug: 'influence', label: 'Developer Influence Score', group: 'Developer Intelligence', route: 'influence', page: '/dashboard/influence', scope: 'user', aliases: ['developer-influence', 'developer-influence-score'] },
  { slug: 'career-growth', label: 'Career Growth Graph', group: 'Developer Intelligence', route: 'career-growth', page: '/dashboard/career-growth', scope: 'user', aliases: ['career', 'career-growth-graph'] },
  { slug: 'file-ownership', label: 'File Ownership Inference', group: 'Developer Intelligence', route: 'file-ownership', page: '/dashboard/file-ownership', scope: 'repo', aliases: ['ownership', 'file-ownership-inference'] },
  { slug: 'contributor-network', label: 'Contributor Network Analysis', group: 'Developer Intelligence', route: 'contributor-network', page: '/dashboard/contributor-network', scope: 'repo', aliases: ['network', 'contributors', 'contributor-network-analysis'] },

  { slug: 'burnout', label: 'Maintainer Burnout Detection', group: 'Community Health', route: 'burnout', page: '/dashboard/burnout', scope: 'repo', aliases: ['maintainer-burnout', 'maintainer-burnout-detection'] },
  { slug: 'bus-factor', label: 'Bus Factor Analysis', group: 'Community Health', route: 'bus-factor', page: '/dashboard/bus-factor', scope: 'repo', aliases: ['bus', 'bus-factor-analysis'] },
  { slug: 'churn', label: 'Contributor Churn Analysis', group: 'Community Health', route: 'churn', page: '/dashboard/churn', scope: 'repo', aliases: ['contributor-churn', 'contributor-churn-analysis'] },
  { slug: 'engagement', label: 'Community Engagement Score', group: 'Community Health', route: 'engagement', page: '/dashboard/engagement', scope: 'repo', aliases: ['community-engagement', 'community-engagement-score'] },
  { slug: 'issue-lifecycle', label: 'Issue Lifecycle Analytics', group: 'Community Health', route: 'issue-lifecycle', page: '/dashboard/issue-lifecycle', scope: 'repo', aliases: ['issues', 'issue-lifecycle-analytics'] },
  { slug: 'repo-health', label: 'Repository Health Score', group: 'Community Health', route: 'repo-health', page: '/dashboard/repo-health', scope: 'repo', aliases: ['health', 'repository-health-score'] },

  { slug: 'explain', label: 'Instant Repo Explanation', group: 'AI Documentation', route: 'explain', page: '/dashboard/explain', scope: 'repo', aliases: ['explanation', 'instant-repo-explanation'] },
  { slug: 'onboarding', label: 'Onboarding Guide Generator', group: 'AI Documentation', route: 'onboarding', page: '/dashboard/onboarding', scope: 'repo', aliases: ['onboarding-guide', 'onboarding-guide-generator'] },
  { slug: 'learning-path', label: 'Learning Path Generator', group: 'AI Documentation', route: 'learning-path', page: '/dashboard/learning-path', scope: 'repo', aliases: ['learning', 'learning-path-generator'] },
  { slug: 'todos', label: 'Automatic TODO Extraction', group: 'AI Documentation', route: 'todos', page: '/dashboard/todos', scope: 'repo', aliases: ['todo', 'automatic-todo-extraction'] },
  { slug: 'pr-impact', label: 'PR Impact Prediction', group: 'AI Documentation', route: 'pr-impact', page: '/dashboard/pr-impact', scope: 'repo', aliases: ['pull-request-impact', 'pr-impact-prediction'] },
  { slug: 'refactor', label: 'Refactor Opportunity Detection', group: 'AI Documentation', route: 'refactor', page: '/dashboard/refactor', scope: 'repo', aliases: ['refactors', 'refactor-opportunity-detection'] },

  { slug: 'ecosystem-map', label: 'Repo Ecosystem Map', group: 'Ecosystem Discovery', route: 'ecosystem-map', page: '/dashboard/ecosystem-map', scope: 'repo', aliases: ['ecosystem', 'repo-ecosystem-map'] },
  { slug: 'underrated', label: 'Underrated Repo Finder', group: 'Ecosystem Discovery', route: 'underrated', page: '/dashboard/underrated', scope: 'query', aliases: ['hidden-gems', 'underrated-repo-finder'] },
  { slug: 'similarity', label: 'Repo Similarity Engine', group: 'Ecosystem Discovery', route: 'similarity', page: '/dashboard/similarity', scope: 'repo', aliases: ['similar', 'repo-similarity-engine'] },
  { slug: 'tech-radar', label: 'Emerging Tech Radar', group: 'Ecosystem Discovery', route: 'tech-radar', page: '/dashboard/tech-radar', scope: 'query', aliases: ['radar', 'emerging-tech-radar'] },
  { slug: 'startup-ideas', label: 'Startup Ideas from Repos', group: 'Ecosystem Discovery', route: 'startup-ideas', page: '/dashboard/startup-ideas', scope: 'repo', aliases: ['startup', 'startup-ideas-from-repos'] },
  { slug: 'duplicates', label: 'Duplicate Project Detection', group: 'Ecosystem Discovery', route: 'duplicates', page: '/dashboard/duplicates', scope: 'repo', aliases: ['duplicate', 'duplicate-project-detection'] },

  { slug: 'vuln-scan', label: 'Vulnerability Scanner', group: 'Security', route: 'vuln-scan', page: '/dashboard/vuln-scan', scope: 'repo', aliases: ['vulnerabilities', 'vulnerability-scanner'] },
  { slug: 'secret-scan', label: 'Secret & Credential Leak Detection', group: 'Security', route: 'secret-scan', page: '/dashboard/secret-scan', scope: 'repo', aliases: ['secrets', 'credential-leak', 'secret-credential-leak-detection'] },
  { slug: 'license-check', label: 'License Compliance Checker', group: 'Security', route: 'license-check', page: '/dashboard/license-check', scope: 'repo', aliases: ['license', 'license-compliance-checker'] },
  { slug: 'outdated-deps', label: 'Outdated Dependency Alerts', group: 'Security', route: 'outdated-deps', page: '/dashboard/outdated-deps', scope: 'repo', aliases: ['outdated', 'outdated-dependency-alerts'] },
  { slug: 'supply-chain', label: 'Supply Chain Risk Scoring', group: 'Security', route: 'supply-chain', page: '/dashboard/supply-chain', scope: 'repo', aliases: ['supply-chain-risk', 'supply-chain-risk-scoring'] },
  { slug: 'patch-tracking', label: 'Security Patch Tracking', group: 'Security', route: 'patch-tracking', page: '/dashboard/patch-tracking', scope: 'repo', aliases: ['patches', 'security-patch-tracking'] },
]

export function normalizeCommandToken(value: string): string {
  return value.trim().toLowerCase().replace(/^\/+/, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function findGitGptFeature(token: string): GitGptFeature | null {
  const normalized = normalizeCommandToken(token)
  return GIT_GPT_FEATURES.find((feature) => (
    feature.slug === normalized ||
    normalizeCommandToken(feature.label) === normalized ||
    feature.aliases.some((alias) => normalizeCommandToken(alias) === normalized)
  )) ?? null
}
