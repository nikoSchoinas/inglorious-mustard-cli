#!/usr/bin/env node
import { buildProgram } from './cli.js';

buildProgram().parse(process.argv);
