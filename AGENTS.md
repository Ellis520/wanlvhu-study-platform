# Repository conventions

Use pnpm only. Keep Next.js App Router pages and HTTP handlers in src/app, UI in src/components,
domain services in src/lib, database models in src/db and migrations in drizzle.
Use TypeScript strict types and reuse shadcn/ui components. Do not introduce implicit any.
Keep credentials and real student records out of source control. Never infer teacher privileges from client input.
Grades must reflect rubric evidence, not identity. Teacher decisions must remain explicit and auditable.
Run pnpm typecheck, pnpm lint, pnpm test:unit and pnpm build after relevant changes.
The connected platform is not updated automatically by editing this repository.
