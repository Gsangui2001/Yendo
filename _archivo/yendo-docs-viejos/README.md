# Yendo Mensajería - Documentación Completa

**Versión:** MVP  
**Stack:** React + Node.js + Firebase  
**Estado:** Desarrollo activo  
**Última actualización:** Junio 2026

---

## 📌 Vista Rápida

**Propuesta de valor:** "La forma más rápida de pedir un cadete"  
**Usuarios:** 3 tipos (Comercio, Cadete, Admin)  
**Comercios actuales:** 30 adheridos  
**Objetivo Etapa 2:** $300K/mes con 20 comercios pagando

---

## 📁 Estructura de Documentación

### Inicio Rápido
- **CLAUDE.md** - Memoria del proyecto + decisiones técnicas
- **propuesta-valor.md** - Qué es Yendo, por qué existe

### Producto & Diseño
- **usuarios.md** - Los 3 tipos de usuario y sus flujos
- **mvp-features.md** - Funciones que se construyen primero
- **zonas-precios.md** - Sistema de zonas y precios
- **etapas-lanzamiento.md** - Plan Etapa 1, 2, 3

### Arquitectura Técnica
- **arquitectura-general.md** - Diagrama high-level
- **frontend-react.md** - Componentes, estados, rutas
- **backend-node.md** - APIs, endpoints, validaciones
- **firebase-setup.md** - Base de datos, auth, real-time

### Funcionalidades Detalladas
- **pedido-express.md** - El feature estrella (5 segundos)
- **mapa-tiempo-real.md** - Geolocalización + matching
- **historial-facturacion.md** - Datos y reportes
- **admin-dashboard.md** - Vista admin completa

### Desarrollo
- **setup-local.md** - Cómo levantar el proyecto
- **flujo-desarrollo.md** - Git, branches, PRs
- **testing.md** - Tests y QA
- **deployment.md** - A producción

### Plantillas Reutilizables
- **componente-template.md** - Para nuevas features
- **prompts-comunes.md** - Que Claude Code reutilice
- **errores-solucionados.md** - Base de conocimiento

---

## 🎯 Para Claude Code

Archivos que Claude Code consultará frecuentemente:
- `CLAUDE.md` (siempre primero)
- `arquitectura-general.md`
- `mvp-features.md`
- `prompts-comunes.md`

Para integrar a Claude Code en Node.js:
```bash
# En tu carpeta de Yendo:
ln -s ../Obsidian-Vault/Yendo ./docs
```

Así Claude Code puede acceder a toda la documentación mientras desarrolla.

---

## 📊 Métricas de Progreso

| Aspecto | Estado |
|---------|--------|
| Prototipo | ✅ Listo |
| Feedback comercios | En recolección |
| Setup desarrollo | Próximo |
| MVP completo | ~3-4 meses |
| Usuarios pagos | Etapa 2 |

---

## 🚀 Próximos Pasos Inmediatos

1. Mostrar prototipo a 30 comercios
2. Recopilar feedback real
3. Arrancar desarrollo React + Node.js + Firebase
4. Crear tablero en Obsidian para tracking de features

