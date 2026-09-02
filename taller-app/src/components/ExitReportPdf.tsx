import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { TipoServicio } from '../lib/types';

const CLAUSULA_SALIDA =
  'El cliente recibe el vehículo conforme, revisado y en el estado que se ha comprobado en el ' +
  'momento de la entrega, dando por finalizado el servicio solicitado.';

const ETIQUETAS_SERVICIO: Record<TipoServicio, string> = {
  mantenimiento: 'Mantenimiento',
  neumaticos: 'Neumáticos',
  averia: 'Avería',
  pre_itv: 'Pre ITV',
};

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
  clausula: {
    marginTop: 16,
    padding: 10,
    backgroundColor: '#f9fafb',
    borderRadius: 4,
    fontSize: 9,
    color: '#374151',
    lineHeight: 1.4,
  },
  firmaBox: { marginTop: 8, alignItems: 'center' },
  firma: { width: 200, height: 90, objectFit: 'contain' },
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

interface ExitReportPdfProps {
  cliente: { nombre: string; telefono?: string | null };
  vehiculo: { matricula: string; marca?: string | null; modelo?: string | null };
  tipoServicio: TipoServicio;
  fechaEntrada?: Date | null;
  fechaEntrega: Date;
  /** URL del informe de entrada (PDF), si se generó — se referencia como
   *  enlace para que el cliente pueda consultar los daños/estado inicial
   *  sin repetir todo ese contenido aquí. */
  pdfEntradaUrl?: string | null;
  firmaUrl: string;
}

/**
 * Informe PDF que se genera al ENTREGAR el vehículo (checkout), con la
 * firma de conformidad de salida — distinto del informe de entrada (que ya
 * incluye fotos, daños marcados y la primera firma). No repite el detalle
 * de daños/fotos: si hace falta consultarlo, remite al informe de entrada.
 */
export default function ExitReportPdf({
  cliente,
  vehiculo,
  tipoServicio,
  fechaEntrada,
  fechaEntrega,
  pdfEntradaUrl,
  firmaUrl,
}: ExitReportPdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Informe de Entrega de Vehículo</Text>
          <Text style={styles.subtitle}>
            {fechaEntrega.toLocaleDateString('es-ES')} · {fechaEntrega.toLocaleTimeString('es-ES')}
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
          <Text style={styles.sectionTitle}>Vehículo y servicio</Text>
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
          <View style={styles.row}>
            <Text style={styles.label}>Tipo de servicio</Text>
            <Text style={styles.value}>{ETIQUETAS_SERVICIO[tipoServicio]}</Text>
          </View>
          {fechaEntrada && (
            <View style={styles.row}>
              <Text style={styles.label}>Fecha de entrada</Text>
              <Text style={styles.value}>{fechaEntrada.toLocaleDateString('es-ES')}</Text>
            </View>
          )}
          <View style={styles.row}>
            <Text style={styles.label}>Fecha de entrega</Text>
            <Text style={styles.value}>{fechaEntrega.toLocaleDateString('es-ES')}</Text>
          </View>
          {pdfEntradaUrl && (
            <View style={styles.row}>
              <Text style={styles.label}>Informe de entrada</Text>
              <Text style={{ ...styles.value, color: '#2563eb' }}>{pdfEntradaUrl}</Text>
            </View>
          )}
        </View>

        <Text style={styles.clausula}>{CLAUSULA_SALIDA}</Text>

        <View style={styles.firmaBox}>
          <Image src={firmaUrl} style={styles.firma} />
          <Text style={{ color: '#6b7280', marginTop: 2 }}>Firma de conformidad del cliente</Text>
        </View>

        <Text style={styles.footer} fixed>
          Documento generado automáticamente · TallerGo
        </Text>
      </Page>
    </Document>
  );
}
