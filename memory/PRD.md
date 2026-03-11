# SmokePing Modern - Network Monitoring System PRD

## Original Problem Statement
SmokePing tarzı bir ağ izleme sistemi. Birden fazla Ubuntu sunucudan ping ve MTR ile izleme yapılacak. Rota değişikliklerinde bildirim, threshold aşımında bildirim, Grafana tarzı güzel grafikler ve public monitor sayfası olacak. 10-20 sunucu için agent yapısı.

## Architecture
- **Backend**: FastAPI + MongoDB + WebSocket
- **Frontend**: React + Recharts + Shadcn UI
- **Agent**: Python script (WebSocket client)
- **Auth**: JWT based authentication

## User Personas
1. **System Administrator**: Manages agents, targets, and settings
2. **Public Viewer**: Views public status page without login

## Core Requirements (Static)
- [x] Multi-agent monitoring from multiple servers
- [x] Ping latency monitoring
- [x] MTR route tracking
- [x] Latency threshold alerts
- [x] Route change alerts
- [x] SMTP email notifications
- [x] Grafana-style dark theme graphs (Recharts)
- [x] Public monitoring page
- [x] 30-second update interval
- [x] Unlimited data retention

## What's Been Implemented (Jan 11, 2026)
- Complete backend API with WebSocket support
- JWT authentication (register/login)
- Agent management with auto-generated Python scripts
- Target host management with thresholds
- Real-time ping result collection
- MTR route tracking with change detection
- Alert system (high_latency, packet_loss, route_change, agent_down)
- SMTP notification configuration
- Dashboard with Grafana-style charts
- Public status page (no auth required)
- Agent script generator for Ubuntu servers

## MongoDB Collections
- users, agents, targets, ping_results, mtr_results, alerts, settings

## Prioritized Backlog
### P0 (Critical) - DONE
- [x] Core monitoring infrastructure
- [x] Agent WebSocket communication
- [x] Alert system

### P1 (High Priority)
- [ ] Agent auto-start systemd service generation
- [ ] Historical data export (CSV/JSON)
- [ ] Multi-user support with roles

### P2 (Medium Priority)
- [ ] Grafana integration via API
- [ ] Slack/Discord notifications
- [ ] Geographic agent visualization
- [ ] Performance analytics and reports

## Next Tasks
1. Deploy Python agent on production servers
2. Configure SMTP for email alerts
3. Add more targets to monitor
4. Test route change detection
