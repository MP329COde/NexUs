import EmptyState from './EmptyState.jsx';

export default function DataTable({ columns, rows, renderRow, emptyTitle = 'Aucune donnée', emptyHint }) {
  if (!rows || rows.length === 0) {
    return <EmptyState title={emptyTitle} hint={emptyHint} />;
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => renderRow(row, i))}
        </tbody>
      </table>
    </div>
  );
}
