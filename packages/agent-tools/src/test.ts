import { Tool, ToolRegistry } from '@corint/agent-core';
import { QuerySQLTool } from '@corint/agent-tools';

function testToolRegistry() {
  console.log('=== Testing Tool Registry ===\n');

  const registry = new ToolRegistry();
  const querySQLTool = new QuerySQLTool();

  registry.register(querySQLTool);

  console.log('✓ Tool registered:', querySQLTool.name);
  console.log('✓ Tool description:', querySQLTool.description);

  const retrievedTool = registry.get('query_sql');
  console.log('✓ Tool retrieved:', retrievedTool?.name);

  const allTools = registry.getAll();
  console.log('✓ Total tools:', allTools.length);

  const openAITools = registry.getOpenAITools();
  console.log('✓ OpenAI format tools:', openAITools.length);
  console.log('✓ Tool spec:', JSON.stringify(openAITools[0], null, 2));

  console.log('\n=== Tool Registry Test Complete ===');
}

testToolRegistry();
