import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

const AVISO_NO_FISCAL =
  'Documento de gestión interna del taller — no es una factura fiscal válida a efectos de ' +
  'Hacienda (no incluye numeración correlativa oficial ni desglose de IVA).';

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: 'Helvetica', color: '#1f2937' },
  header: { marginBottom: 16, borderBottom: 1, borderColor: '#e5e7eb', paddingBottom: 12 },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 2 },
  subtitle: { fontSize: 10, color: '#6b7280' },
  section: { marginBottom: 14 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 6,
    color: '#111827',
    textTransform: 'uppercase',
  },
  row: { flexDirection: 'row', marginBottom: 3 },
  label: { width: 110, color: '#6b7280' },
  value: { flex: 1, fontWeight: 700 },
  tabla: { marginTop: 4, borderTop: 1, borderColor: '#e5e7eb' },
  filaTabla: {
    flexDirection: 'row',
    paddingVertical: 5,
    borderBottom: 1,
    borderColor: '#f3f4f6',
  },
  colConcepto: { flex: 1 },
  colCantidad: { width: 50, textAlign: 'right' },
  colPrecio: { width: 70, textAlign: 'right' },
  colImporte: { width: 80, textAlign: 'right', fontWeight: 700 },
  cabeceraTabla: {
    flexDirection: 'row',
    paddingBottom: 5,
    fontSize: 9,
    color: '#6b7280',
    textTransform: 'uppercase',
  },
  totalBox: {
    marginTop: 10,
    alignSelf: 'flex-end',
    width: 220,
  },
  filaTotal: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  filaTotalFinal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 6,
    marginTop: 4,
    borderTop: 1,
    borderColor: '#111827',
  },
  aviso: {
    marginTop: 18,
    padding: 10,
    backgroundColor: '#f9fafb',
    borderRadius: 4,
    fontSize: 8,
    color: '#6b7280',
    lineHeight: 1.4,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 32,
    right: 32,
    fontSize: 8,
    color: '#9ca3af',
    textAlign: 'center',
  },
});

function euros(n: number): string {
  return `${n.toFixed(2)} €`;
}

interface LineaFacturaPdf {
  nombre: string;
  cantidad: number;
  precioUnitario: number;
}

interface FacturaPdfProps {
  cliente: { nombre: string; telefono?: string | null };
  vehiculo: { matricula: string; marca?: string | null; modelo?: string | null };
  fecha: Date;
  conceptoManoObra: string | null;
  precioManoObra: number;
  piezas: LineaFacturaPdf[];
}

/**
 * PDF de la factura/presupuesto interno final, generado al ENTREGAR el
 * vehículo (checkout) a partir del Presupuesto aprobado + su detalle de
 * piezas. Es un documento de GESTIÓN INTERNA, no una factura fiscal (ver
 * aviso al pie) — decisión explícita del taller para mantenerlo simple.
 */
export default function FacturaPdf({
  cliente,
  vehiculo,
  fecha,
  conceptoManoObra,
  precioManoObra,
  piezas,
}: FacturaPdfProps) {
  const totalPiezas = piezas.reduce((acc, p) => acc + p.cantidad * p.precioUnitario, 0);
  const total = totalPiezas + precioManoObra;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Presupuesto / Factura interna</Text>
          <Text style={styles.subtitle}>
            {fecha.toLocaleDateString('es-ES')} · {fecha.toLocaleTimeString('es-ES')}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cliente</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Nombre</Text>
            <Text style={styles.value}>{cliente.nombre}</Text>
          </View>
          {cliente.telefono && (
            <View style={styles.row}>
              <Text style={styles.label}>Teléfono</Text>
              <Text style={styles.value}>{cliente.telefono}</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vehículo</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Matrícula</Text>
            <Text style={styles.value}>{vehiculo.matricula}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Marca / Modelo</Text>
            <Text style={styles.value}>
              {[vehiculo.marca, vehiculo.modelo].filter(Boolean).join(' ') || '—'}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detalle</Text>
          <View style={styles.tabla}>
            <View style={styles.cabeceraTabla}>
              <Text style={styles.colConcepto}>Concepto</Text>
              <Text style={styles.colCantidad}>Cant.</Text>
              <Text style={styles.colPrecio}>Precio</Text>
              <Text style={styles.colImporte}>Importe</Text>
            </View>
            {conceptoManoObra && precioManoObra > 0 && (
              <View style={styles.filaTabla}>
                <Text style={styles.colConcepto}>{conceptoManoObra || 'Mano de obra'}</Text>
                <Text style={styles.colCantidad}>1</Text>
                <Text style={styles.colPrecio}>{euros(precioManoObra)}</Text>
                <Text style={styles.colImporte}>{euros(precioManoObra)}</Text>
              </View>
            )}
            {piezas.map((p, i) => (
              <View key={i} style={styles.filaTabla}>
                <Text style={styles.colConcepto}>{p.nombre}</Text>
                <Text style={styles.colCantidad}>{p.cantidad}</Text>
                <Text style={styles.colPrecio}>{euros(p.precioUnitario)}</Text>
                <Text style={styles.colImporte}>{euros(p.cantidad * p.precioUnitario)}</Text>
              </View>
            ))}
          </View>

          <View style={styles.totalBox}>
            <View style={styles.filaTotal}>
              <Text>Mano de obra</Text>
              <Text>{euros(precioManoObra)}</Text>
            </View>
            <View style={styles.filaTotal}>
              <Text>Piezas</Text>
              <Text>{euros(totalPiezas)}</Text>
            </View>
            <View style={styles.filaTotalFinal}>
              <Text style={{ fontWeight: 700 }}>Total</Text>
              <Text style={{ fontWeight: 700 }}>{euros(total)}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.aviso}>{AVISO_NO_FISCAL}</Text>

        <Text style={styles.footer} fixed>
          Documento generado automáticamente · TallerGo
        </Text>
      </Page>
    </Document>
  );
}
