#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';

const program = new Command();

program
  .name('corint-agent')
  .description('CORINT Risk Agent - AI-native assistant for risk management')
  .version('1.0.0');

program
  .command('chat')
  .description('Start interactive chat session')
  .action(() => {
    console.log(chalk.blue('Starting CORINT Risk Agent...'));
    console.log(chalk.yellow('Chat mode not implemented yet'));
  });

program
  .command('run')
  .description('Run a single command')
  .argument('<prompt>', 'Command prompt')
  .action((prompt: string) => {
    console.log(chalk.blue(`Running: ${prompt}`));
    console.log(chalk.yellow('Run mode not implemented yet'));
  });

program.parse();
