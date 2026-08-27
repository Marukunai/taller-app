import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { DanoMarcador, NivelCombustible, TipoServicio } from '../lib/types';
import { describirPosicion } from '../lib/carSchemaZones';

const CLAUSULA_ENTRADA =
  'El cliente autoriza las pruebas en carretera necesarias y declara que los daños ' +
  'reflejados en este documento corresponden al estado actual del vehículo al ser ' +
  'depositado en el taller.';

const ETIQUETAS_SERVICIO: Record<TipoServicio, string> = {
  mantenimiento: 'Mantenimiento',
  neumaticos: 'Neumáticos',
  averia: 'Avería',
};

const ETIQUETAS_DANO: Record<DanoMarcador['tipo'], string> = {
  arañazo: 'Arañazo',
  abolladura: 'Abolladura',
  rotura: 'Rotura',
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photo: { width: 110, height: 82, objectFit: 'cover', borderRadius: 4 },
  danoItem: { flexDirection: 'row', marginBottom: 2 },
  clausula: {
    marginTop: 16,
    padding: 10,
    backgroundColor: '#f9fafb',
    borderRadius: 4,
    fontSize: 9,
    color: '#374151',
    lineHeight: 1.4,
  },
  esquemaImagen: {
    // Esquema de 4 vistas completo, proporción 3:2 igual que el viewBox de
    // /car-schema.svg (sin padding, ver renderDamageSchema.ts).
    width: 280,
    height: 187,
    objectFit: 'contain',
    marginBottom: 8,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 4,
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

interface InspectionReportPdfProps {
  cliente: { nombre: string; dni: string; telefono: string; email?: string | null };
  vehiculo: { matricula: string; marca?: string; modelo?: string };
  tipoServicio: TipoServicio;
  descripcionAveria?: string;
  kilometraje: number;
  nivelCombustible: NivelCombustible;
  fotos: string[];
  danos: DanoMarcador[];
  observaciones?: string;
  /** PNG (data URL) del esquema del vehículo con los marcadores de daño ya
   *  dibujados encima. Si no se pudo generar, se omite y queda solo la lista
   *  de texto de más abajo. */
  esquemaImagenUrl?: string | null;
  firmaUrl: string;
  fecha: Date;
}

export default function InspectionReportPdf({
  cliente,
  vehiculo,
  tipoServicio,
  descripcionAveria,
  kilometraje,
  nivelCombustible,
  fotos,
  danos,
  observaciones,
  esquemaImagenUrl,
  firmaUrl,
  fecha,
}: InspectionReportPdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Informe de Inspección de Entrada</Text>
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
          <View style={styles.row}>
            <Text style={styles.label}>DNI</Text>
            <Text style={styles.value}>{cliente.dni}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Teléfono</Text>
            <Text style={styles.value}>{cliente.telefono}</Text>
          </View>
          {cliente.email && (
            <View style={styles.row}>
              <Text style={styles.label}>Email</Text>
              <Text style={styles.value}>{cliente.email}</Text>
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
          {descripcionAveria && (
            <View style={styles.row}>
              <Text style={styles.label}>Descripción</Text>
              <Text style={styles.value}>{descripcionAveria}</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Estado de entrada</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Kilometraje</Text>
            <Text style={styles.value}>{kilometraje.toLocaleString('es-ES')} km</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Combustible</Text>
            <Text style={styles.value}>{nivelCombustible}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Daños marcados ({danos.length})</Text>
          {esquemaImagenUrl && <Image src={esquemaImagenUrl} style={styles.esquemaImagen} />}
          {danos.length === 0 ? (
            <Text>Sin daños marcados en la inspección de entrada.</Text>
          ) : (
            danos.map((d, i) => {
              const posicion = describirPosicion(d);
              return (
                <View key={d.id} style={styles.danoItem}>
                  <Text>
                    {i + 1}. {ETIQUETAS_DANO[d.tipo]}
                    {posicion ? ` — ${posicion}` : ''}
                    {d.observacion ? ` (${d.observacion})` : ''}
                  </Text>
                </View>
              );
            })
          )}
        </View>

        {observaciones && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Observaciones generales</Text>
            <Text>{observaciones}</Text>
          </View>
        )}

        {fotos.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Fotografías ({fotos.length})</Text>
            <View style={styles.grid}>
              {fotos.slice(0, 6).map((url) => (
                <Image key={url} src={url} style={styles.photo} />
              ))}
            </View>
          </View>
        )}

        <Text style={styles.clausula}>{CLAUSULA_ENTRADA}</Text>

        <View style={styles.firmaBox}>
          <Image src={firmaUrl} style={styles.firma} />
          <Text style={{ color: '#6b7280', marginTop: 2 }}>Firma del cliente</Text>
        </View>

        <Text style={styles.footer} fixed>
          Documento generado automáticamente · TallerGo
        </Text>
      </Page>
    </Document>
  );
}
