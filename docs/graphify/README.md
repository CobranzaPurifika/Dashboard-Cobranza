# Grafo del código (graphify)

Mapa del código del repositorio generado con [graphify](https://github.com/Graphify-Labs/graphify)
en modo **solo local** (`--code-only`): se analiza la estructura del código sin enviar nada a
ningún servicio de IA y sin claves de API.

| Archivo | Contenido |
|---|---|
| `graph.html` | Grafo interactivo. Descárgalo y ábrelo en el navegador. |
| `GRAPH_REPORT.md` | Resumen: piezas más conectadas, conexiones notables, ciclos de importación. |
| `graph.json` | Datos del grafo, para consultas con la línea de comandos. |

Los grupos aparecen como "Community N" porque ponerles nombre requiere un modelo de IA.
El reporte indica el commit del que se generó; si el código cambió después, el grafo está desactualizado.

## Regenerar

```bash
uv tool install 'graphifyy[sql]'          # el paquete se llama graphifyy (con dos "y")
graphify extract . --code-only --out /tmp/graphify
graphify cluster-only /tmp/graphify --no-label
cp /tmp/graphify/graphify-out/{graph.html,graph.json,GRAPH_REPORT.md} docs/graphify/
```

## Consultar

```bash
graphify explain "ManagementComponent" --graph docs/graphify/graph.json
graphify affected "normalizeBusinessKey()" --graph docs/graphify/graph.json
graphify query "¿cómo se registran los pagos?" --graph docs/graphify/graph.json
```
