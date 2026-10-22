import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { compilerProvenance } from '../spec/bundle.js';
import { JobTable } from './jobs.js';
import { killAllChildren } from './run-cli.js';
import { registerTools } from './tools.js';

export interface McpServerOptions {
  /** The CLI entry script every tool runs (tests use a stub). Default: SITELOOPER_MCP_CLI, then bin/sitelooper.js. */
  cliPath?: string;
  /** Accept a `reset_cmd` tool input. Default: SITELOOPER_MCP_ALLOW_RESET_CMD === '1'. */
  allowResetCmd?: boolean;
}

/** The sitelooper MCP server, not yet connected to a transport. */
export function createMcpServer(opts: McpServerOptions = {}): { server: McpServer; jobs: JobTable } {
  const server = new McpServer(
    { name: 'sitelooper', version: compilerProvenance().version },
    {
      instructions:
        'sitelooper authors browser tests with an agent and compiles them to plain Playwright. ' +
        'Authoring: open (learn=true) → set_var → one do or assert per verifiable outcome → save_flow → build_start, then poll job_status. ' +
        'build_start, check (ready), repair_propose and rerecord are background jobs polled with job_status. ' +
        'Credentials only as {{env:NAME}} / {{totp:NAME}} markers; never ask for a secret value.',
    },
  );
  const jobs = new JobTable();
  registerTools(server, {
    cliPath: opts.cliPath,
    jobs,
    allowResetCmd: opts.allowResetCmd ?? process.env.SITELOOPER_MCP_ALLOW_RESET_CMD === '1',
  });
  return { server, jobs };
}

/**
 * `sitelooper mcp`: serve over stdio until the client disconnects. stdout is
 * the protocol channel, so every console method that would write to it is
 * pointed at stderr first.
 */
export async function runMcpServer(opts: McpServerOptions = {}): Promise<void> {
  console.log = console.error;
  console.info = console.error;
  console.debug = console.error;
  const { server, jobs } = createMcpServer(opts);
  const transport = new StdioServerTransport();
  const closed = new Promise<void>((resolve) => {
    transport.onclose = () => resolve();
    process.stdin.once('end', () => resolve());
  });
  await server.connect(transport);
  await closed;
  jobs.killAll();
  killAllChildren();
  await server.close().catch(() => {});
}
