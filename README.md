# tiny-stack-vm

A faithful interpreter of make.fun's tiny stack ISA v1: runs every bytecode program in `/input` and writes its stdout and exit code to `/output`. Exact 32-bit wrapping, unsigned ops, and all ten traps with their own exit codes.

## Run it

```sh
MAKEFUN_INPUT_DIR=practice/input MAKEFUN_OUTPUT_DIR=out node main.ts
```
