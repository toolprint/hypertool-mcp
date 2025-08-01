/**
 * Example MCP configuration templates
 */

import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ExampleConfig } from '../setup/types.js';
import { createChildLogger } from '../../utils/logging.js';

const logger = createChildLogger({ module: 'setup/examples' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the path to the examples directory
 * Handles both development and production environments
 */
function getExamplesPath(): string {
  // Check if we're running from dist (production)
  if (__dirname.includes('/dist/')) {
    // In production, examples are bundled in dist/examples/mcp/
    return join(__dirname, '../../../examples/mcp');
  } else {
    // In development, use source examples
    return join(__dirname, '../../../examples/mcp');
  }
}

/**
 * Registry of available example configurations
 */
export const EXAMPLE_CONFIGS: ExampleConfig[] = [
  {
    id: 'everything',
    name: 'Everything (Zero Setup)',
    description: 'Complete toolkit with 26 servers - works immediately without any API keys',
    fileName: 'mcp.everything.json',
    serverCount: 26,
    requiresSecrets: false,
    category: 'zero-setup'
  },
  {
    id: 'everything-with-secrets',
    name: 'Everything with Secrets',
    description: 'Full-featured setup with 52 servers - requires your API keys for business tools',
    fileName: 'mcp.everything-with-secrets.json',
    serverCount: 52,
    requiresSecrets: true,
    category: 'full-featured'
  },
  {
    id: 'development',
    name: 'Development Tools',
    description: 'Essential development tools: Git, Docker, filesystem, SQLite, build tools',
    fileName: 'mcp.development.json',
    serverCount: 8,
    requiresSecrets: false,
    category: 'specialized'
  },
  {
    id: 'data-analysis',
    name: 'Data Analysis',
    description: 'Data processing tools: CSV, JSON, Excel, pandas, visualization',
    fileName: 'mcp.data-analysis.json',
    serverCount: 6,
    requiresSecrets: false,
    category: 'specialized'
  },
  {
    id: 'web-automation',
    name: 'Web Automation',
    description: 'Browser automation, web scraping, API testing, and interaction tools',
    fileName: 'mcp.web-automation.json',
    serverCount: 5,
    requiresSecrets: false,
    category: 'specialized'
  },
  {
    id: 'content-research',
    name: 'Content Research',
    description: 'Research tools: Hacker News, web search, scraping, content aggregation',
    fileName: 'mcp.content-research.json',
    serverCount: 4,
    requiresSecrets: false,
    category: 'specialized'
  },
  {
    id: 'system-admin',
    name: 'System Administration',
    description: 'System tools: SSH, terminal, monitoring, configuration management',
    fileName: 'mcp.system-admin.json',
    serverCount: 6,
    requiresSecrets: false,
    category: 'specialized'
  },
  {
    id: 'testing-qa',
    name: 'Testing & QA',
    description: 'Testing frameworks, browser automation, API testing, performance testing',
    fileName: 'mcp.testing-qa.json',
    serverCount: 7,
    requiresSecrets: false,
    category: 'specialized'
  },
  {
    id: 'productivity',
    name: 'Productivity Tools',
    description: 'Time tracking, memory, note-taking, sequential thinking assistance',
    fileName: 'mcp.productivity.json',
    serverCount: 5,
    requiresSecrets: false,
    category: 'specialized'
  },
  {
    id: 'document-processing',
    name: 'Document Processing',
    description: 'Document conversion: Markdown, PDF, Pandoc, text processing',
    fileName: 'mcp.document-processing.json',
    serverCount: 5,
    requiresSecrets: false,
    category: 'specialized'
  },
  {
    id: 'creative-media',
    name: 'Creative Media',
    description: 'Image processing, video editing, audio tools, creative workflows',
    fileName: 'mcp.creative-media.json',
    serverCount: 4,
    requiresSecrets: false,
    category: 'specialized'
  },
  {
    id: 'financial-crypto',
    name: 'Financial & Crypto',
    description: 'Financial APIs, crypto tools, payment processing (requires API keys)',
    fileName: 'mcp.financial-crypto.json',
    serverCount: 6,
    requiresSecrets: true,
    category: 'specialized'
  }
];

/**
 * Load an example configuration file
 */
export async function loadExampleConfig(exampleId: string): Promise<any> {
  const example = EXAMPLE_CONFIGS.find(e => e.id === exampleId);
  if (!example) {
    throw new Error(`Unknown example configuration: ${exampleId}`);
  }

  const examplesPath = getExamplesPath();
  const configPath = join(examplesPath, example.fileName);

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    logger.error(`Failed to load example config ${example.fileName}:`, error);
    throw new Error(`Failed to load example configuration: ${error}`);
  }
}

/**
 * Get example configs by category
 */
export function getExamplesByCategory(category: 'zero-setup' | 'specialized' | 'full-featured'): ExampleConfig[] {
  return EXAMPLE_CONFIGS.filter(e => e.category === category);
}

/**
 * Get detailed information about an example
 */
export function getExampleDetails(exampleId: string): {
  example: ExampleConfig;
  useCases: string[];
  requirements: string[];
} | null {
  const example = EXAMPLE_CONFIGS.find(e => e.id === exampleId);
  if (!example) {
    return null;
  }

  const details: Record<string, { useCases: string[]; requirements: string[] }> = {
    everything: {
      useCases: [
        'Getting started quickly without any setup',
        'Exploring MCP capabilities',
        'Local development and testing',
        'General-purpose AI assistance'
      ],
      requirements: [
        'Node.js installed',
        'Python with uv (for some servers)',
        'Local Docker daemon (for docker server)',
        'kubectl configured (for kubernetes server)'
      ]
    },
    'everything-with-secrets': {
      useCases: [
        'Full business operations automation',
        'Team collaboration and communication',
        'Project management integration',
        'Enterprise workflows'
      ],
      requirements: [
        'All requirements from "everything" config',
        'API keys for each service you want to use',
        'Appropriate permissions in each service',
        'Network access to external APIs'
      ]
    },
    development: {
      useCases: [
        'Software development workflows',
        'Code repository management',
        'Container orchestration',
        'Local database operations'
      ],
      requirements: [
        'Git installed',
        'Docker daemon running',
        'Node.js and Python environments'
      ]
    },
    'data-analysis': {
      useCases: [
        'Data science workflows',
        'CSV/Excel processing',
        'Data visualization',
        'Statistical analysis'
      ],
      requirements: [
        'Python with pandas',
        'Node.js for CSV/JSON tools'
      ]
    },
    'web-automation': {
      useCases: [
        'Web scraping',
        'Browser automation',
        'E2E testing',
        'API interaction'
      ],
      requirements: [
        'Chrome/Chromium installed',
        'Node.js environment'
      ]
    },
    'content-research': {
      useCases: [
        'Content aggregation',
        'News monitoring',
        'Web research',
        'Information gathering'
      ],
      requirements: [
        'Internet connection',
        'Node.js environment'
      ]
    },
    'system-admin': {
      useCases: [
        'Server management',
        'System monitoring',
        'Configuration management',
        'Remote administration'
      ],
      requirements: [
        'SSH client',
        'Terminal access',
        'Appropriate system permissions'
      ]
    },
    'testing-qa': {
      useCases: [
        'Automated testing',
        'Performance testing',
        'API testing',
        'Cross-browser testing'
      ],
      requirements: [
        'Testing frameworks installed',
        'Browser drivers',
        'Node.js/Python environments'
      ]
    },
    productivity: {
      useCases: [
        'Task management',
        'Time tracking',
        'Note organization',
        'Workflow optimization'
      ],
      requirements: [
        'Node.js environment',
        'Local storage access'
      ]
    },
    'document-processing': {
      useCases: [
        'Document conversion',
        'PDF processing',
        'Markdown workflows',
        'Report generation'
      ],
      requirements: [
        'Pandoc installed',
        'PDF tools',
        'Node.js environment'
      ]
    },
    'creative-media': {
      useCases: [
        'Image processing',
        'Video editing workflows',
        'Audio manipulation',
        'Creative automation'
      ],
      requirements: [
        'FFmpeg installed',
        'ImageMagick',
        'Media processing tools'
      ]
    },
    'financial-crypto': {
      useCases: [
        'Payment processing',
        'Financial analysis',
        'Cryptocurrency operations',
        'Trading automation'
      ],
      requirements: [
        'API keys for financial services',
        'Secure credential storage',
        'Network access to financial APIs'
      ]
    }
  };

  return {
    example,
    useCases: details[exampleId]?.useCases || [],
    requirements: details[exampleId]?.requirements || []
  };
}

/**
 * Check if examples are available
 */
export async function verifyExamplesAvailable(): Promise<boolean> {
  try {
    const examplesPath = getExamplesPath();
    await fs.access(examplesPath);
    
    // Check if at least one example file exists
    const testFile = join(examplesPath, 'mcp.everything.json');
    await fs.access(testFile);
    
    return true;
  } catch {
    logger.warn('Example configurations not found. This may be a development environment issue.');
    return false;
  }
}