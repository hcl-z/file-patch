#!/usr/bin/env node

import { program } from 'commander';
import { createPatch, commitPatch, applyPatch, revertPatch } from './patcher';

program
  .name('file-patcher')
  .description('A tool for creating and applying patches to source files')
  .version('1.0.0');

program
  .command('create <file>')
  .description('Create a patch for the specified file')
  .action(async (file: string) => {
    try {
      await createPatch(file);
      console.log(`Patch environment created for ${file}`);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('commit <file>')
  .description('Generate patch file from the modified copy')
  .action(async (file: string) => {
    try {
      await commitPatch(file);
      console.log(`Patch file generated for ${file}`);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('apply <file>')
  .description('Apply patch to the original file')
  .action(async (file: string) => {
    try {
      await applyPatch(file);
      console.log(`Patch applied to ${file}`);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('revert <file>')
  .description('Revert patch from the file')
  .action(async (file: string) => {
    try {
      await revertPatch(file);
      console.log(`Patch reverted from ${file}`);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
