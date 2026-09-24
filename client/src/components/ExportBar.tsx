type Props = {
  reportId?: string;
  canExport: boolean;
  canManifest: boolean;
  canReset: boolean;
  onNew: () => void;
};

function Slot({
  live,
  href,
  onClick,
  children,
  hint,
}: {
  live: boolean;
  href?: string;
  onClick?: () => void;
  children: string;
  hint: string;
}) {
  const cls = live ? "export-slot export-slot--live" : "export-slot export-slot--dim";
  if (!live) {
    return (
      <span className={cls} title={hint} aria-disabled="true">
        {children}
      </span>
    );
  }
  if (href) {
    return (
      <a className={cls} href={href} target="_blank" rel="noreferrer" title={hint}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" className={cls} onClick={onClick} title={hint}>
      {children}
    </button>
  );
}

export default function ExportBar({ reportId, canExport, canManifest, canReset, onNew }: Props) {
  const waiting = "Runs after a dossier exists.";
  const locked = "Confirm TARGET in Identity Workbench before export.";
  return (
    <div className="export-bar" role="toolbar" aria-label="Report exports">
      <Slot
        live={canExport && Boolean(reportId)}
        href={reportId ? `/api/reports/${reportId}/pdf` : undefined}
        hint={canExport ? "Open the client PDF dossier" : reportId ? locked : waiting}
      >
        PDF Dossier
      </Slot>
      <Slot
        live={canExport && Boolean(reportId)}
        href={reportId ? `/api/reports/${reportId}/html` : undefined}
        hint={canExport ? "Open the HTML brief" : reportId ? locked : waiting}
      >
        HTML
      </Slot>
      <Slot
        live={canManifest && Boolean(reportId)}
        href={reportId ? `/api/reports/${reportId}/manifest` : undefined}
        hint={canManifest ? "Download SHA-256 MANIFEST.json" : waiting}
      >
        Manifest
      </Slot>
      <Slot live={canReset} onClick={onNew} hint={canReset ? "Start a new investigation" : waiting}>
        New Report
      </Slot>
    </div>
  );
}
