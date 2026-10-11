export function helpText(): string {
  return `Spectra Desk CLI

Commands:
  intake     Run a case from a name, email, or username. Fast is the default.
  divide     Print the corroboration matrix for a case id.
  brief      Print the client brief path and ledger counts.
  lock       Refuses unless you pass --human. Agents cannot LOCK.
  export     Write ledger, markdown, and optional STIX-lite into the case folder.
  dossier    Write a public-source PDF. --demo is the fictional sample. Never LOCKS.
  channel    grant or check a paid Telegram id. The Windows app stays free.
  doctor     Check catalog, hash, port, Fast cap, PDF, MCP, CLI, redactor.
  toolkit    Search the real catalog.
  case       list, rename, archive, export, destroy, demo.
  investigate  Alias of intake.
  list | show <id> | validate

Public sources only. Investigative lead, not legal proof of identity.
You confirm LOCKED. The machine does not.
`;
}
