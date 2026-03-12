from fastapi import FastAPI, APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
import json
import asyncio
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Config
JWT_SECRET = os.environ.get('JWT_SECRET', 'smokeping-secret-key-change-in-production')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# Create the main app
app = FastAPI(title="NetPing API")
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.frontend_connections: List[WebSocket] = []

    async def connect_agent(self, websocket: WebSocket, agent_id: str):
        await websocket.accept()
        self.active_connections[agent_id] = websocket
        # Update agent status
        await db.agents.update_one(
            {"id": agent_id},
            {"$set": {"status": "online", "last_seen": datetime.now(timezone.utc).isoformat()}}
        )
        await self.broadcast_to_frontend({"type": "agent_status", "agent_id": agent_id, "status": "online"})

    async def connect_frontend(self, websocket: WebSocket):
        await websocket.accept()
        self.frontend_connections.append(websocket)

    def disconnect_agent(self, agent_id: str):
        if agent_id in self.active_connections:
            del self.active_connections[agent_id]

    def disconnect_frontend(self, websocket: WebSocket):
        if websocket in self.frontend_connections:
            self.frontend_connections.remove(websocket)

    async def send_to_agent(self, agent_id: str, message: dict):
        if agent_id in self.active_connections:
            await self.active_connections[agent_id].send_json(message)

    async def broadcast_to_frontend(self, message: dict):
        disconnected = []
        for connection in self.frontend_connections:
            try:
                await connection.send_json(message)
            except:
                disconnected.append(connection)
        for conn in disconnected:
            self.disconnect_frontend(conn)

manager = ConnectionManager()

# ============ Models ============
class UserCreate(BaseModel):
    username: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    password_hash: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class AgentCreate(BaseModel):
    name: str
    description: Optional[str] = ""

class Agent(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str = ""
    api_key: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: str = "offline"
    ip_address: Optional[str] = None
    last_seen: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class TargetCreate(BaseModel):
    hostname: str
    name: Optional[str] = ""
    threshold_ms: int = 100
    enabled: bool = True

class Target(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    hostname: str
    name: str = ""
    threshold_ms: int = 100
    enabled: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class PingResult(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_id: str
    target_id: str
    target_hostname: str
    latency_ms: Optional[float] = None
    packet_loss: float = 0.0
    status: str = "success"  # success, timeout, error
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class MtrHop(BaseModel):
    hop: int
    ip: Optional[str] = None
    hostname: Optional[str] = None
    loss_percent: float = 0.0
    avg_ms: Optional[float] = None

class MtrResult(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_id: str
    target_id: str
    target_hostname: str
    hops: List[Dict[str, Any]] = []
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class Alert(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    alert_type: str  # high_latency, packet_loss, route_change, agent_down
    message: str
    agent_id: Optional[str] = None
    agent_name: Optional[str] = None
    target_id: Optional[str] = None
    target_hostname: Optional[str] = None
    severity: str = "warning"  # info, warning, critical
    resolved: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class SmtpSettings(BaseModel):
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_pass: str = ""
    smtp_from: str = ""
    alert_emails: List[str] = []
    enabled: bool = False

class Settings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = "global_settings"
    smtp: SmtpSettings = SmtpSettings()
    default_threshold_ms: int = 100
    ping_interval_seconds: int = 30

# ============ Auth Helpers ============
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_token(user_id: str, username: str) -> str:
    payload = {
        "user_id": user_id,
        "username": username,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ============ Email Helper ============
async def send_alert_email(alert: Alert):
    settings = await db.settings.find_one({"id": "global_settings"}, {"_id": 0})
    if not settings or not settings.get("smtp", {}).get("enabled"):
        return
    
    smtp = settings["smtp"]
    if not smtp.get("alert_emails"):
        return
    
    try:
        msg = MIMEMultipart()
        msg['From'] = smtp.get("smtp_from", smtp.get("smtp_user"))
        msg['To'] = ", ".join(smtp["alert_emails"])
        msg['Subject'] = f"[NetPing Alert] {alert.severity.upper()}: {alert.alert_type}"
        
        body = f"""
Alert Type: {alert.alert_type}
Severity: {alert.severity}
Message: {alert.message}
Agent: {alert.agent_name or 'N/A'}
Target: {alert.target_hostname or 'N/A'}
Time: {alert.created_at}
        """
        msg.attach(MIMEText(body, 'plain'))
        
        server = smtplib.SMTP(smtp["smtp_host"], smtp["smtp_port"])
        server.starttls()
        if smtp.get("smtp_user") and smtp.get("smtp_pass"):
            server.login(smtp["smtp_user"], smtp["smtp_pass"])
        server.sendmail(msg['From'], smtp["alert_emails"], msg.as_string())
        server.quit()
        logging.info(f"Alert email sent for: {alert.alert_type}")
    except Exception as e:
        logging.error(f"Failed to send alert email: {e}")

# ============ Auth Routes ============
@api_router.post("/auth/register")
async def register(user_data: UserCreate):
    existing = await db.users.find_one({"username": user_data.username})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    user = User(
        username=user_data.username,
        password_hash=hash_password(user_data.password)
    )
    await db.users.insert_one(user.model_dump())
    token = create_token(user.id, user.username)
    return {"token": token, "user": {"id": user.id, "username": user.username}}

@api_router.post("/auth/login")
async def login(user_data: UserLogin):
    user = await db.users.find_one({"username": user_data.username}, {"_id": 0})
    if not user or not verify_password(user_data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_token(user["id"], user["username"])
    return {"token": token, "user": {"id": user["id"], "username": user["username"]}}

@api_router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    return {"id": user["id"], "username": user["username"]}

# ============ Agent Routes ============
@api_router.get("/agents", response_model=List[Dict])
async def get_agents(user: dict = Depends(get_current_user)):
    agents = await db.agents.find({}, {"_id": 0}).to_list(1000)
    return agents

@api_router.post("/agents")
async def create_agent(agent_data: AgentCreate, user: dict = Depends(get_current_user)):
    agent = Agent(name=agent_data.name, description=agent_data.description)
    await db.agents.insert_one(agent.model_dump())
    return agent.model_dump()

@api_router.delete("/agents/{agent_id}")
async def delete_agent(agent_id: str, user: dict = Depends(get_current_user)):
    result = await db.agents.delete_one({"id": agent_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Agent not found")
    # Also delete related data
    await db.ping_results.delete_many({"agent_id": agent_id})
    await db.mtr_results.delete_many({"agent_id": agent_id})
    return {"message": "Agent deleted"}

@api_router.get("/agents/{agent_id}/script")
async def get_agent_script(agent_id: str, user: dict = Depends(get_current_user)):
    agent = await db.agents.find_one({"id": agent_id}, {"_id": 0})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    backend_url = os.environ.get('BACKEND_WS_URL', 'wss://YOUR-DOMAIN.com')
    
    script = f'''#!/usr/bin/env python3
"""
NetPing Agent
Agent ID: {agent_id}
Agent Name: {agent["name"]}
"""
import asyncio
import websockets
import json
import subprocess
import re
import platform
from datetime import datetime

AGENT_ID = "{agent_id}"
API_KEY = "{agent["api_key"]}"
WS_URL = "{backend_url}/api/ws/agent"

async def ping_host(hostname, count=2):
    """Execute ping command and parse results"""
    try:
        if platform.system() == "Windows":
            cmd = ["ping", "-n", str(count), hostname]
        else:
            cmd = ["ping", "-c", str(count), "-W", "2", hostname]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        output = result.stdout + result.stderr
        
        # Parse latency
        latency = None
        if platform.system() == "Windows":
            match = re.search(r"Average = (\\d+)ms", output)
            if match:
                latency = float(match.group(1))
        else:
            match = re.search(r"rtt min/avg/max/mdev = [\\d.]+/([\\d.]+)/", output)
            if match:
                latency = float(match.group(1))
        
        # Parse packet loss
        loss_match = re.search(r"(\\d+)% packet loss", output)
        packet_loss = float(loss_match.group(1)) if loss_match else 0.0
        
        status = "success" if latency is not None else "timeout"
        return {{"latency_ms": latency, "packet_loss": packet_loss, "status": status}}
    except subprocess.TimeoutExpired:
        return {{"latency_ms": None, "packet_loss": 100.0, "status": "timeout"}}
    except Exception as e:
        return {{"latency_ms": None, "packet_loss": 100.0, "status": "error", "error": str(e)}}

async def mtr_host(hostname):
    """Execute MTR command and parse results"""
    try:
        cmd = ["mtr", "-r", "-c", "3", "-n", hostname]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        output = result.stdout
        
        hops = []
        for line in output.split("\\n"):
            match = re.match(r"\\s*(\\d+)\\.\\|--\\s+([\\d.]+|\\?+)\\s+([\\d.]+)%\\s+\\d+\\s+([\\d.]+)?", line)
            if match:
                hop_num = int(match.group(1))
                ip = match.group(2) if match.group(2) != "???" else None
                loss = float(match.group(3))
                avg = float(match.group(4)) if match.group(4) else None
                hops.append({{"hop": hop_num, "ip": ip, "loss_percent": loss, "avg_ms": avg}})
        
        return hops
    except Exception as e:
        return []

async def run_agent():
    while True:
        try:
            uri = f"{{WS_URL}}?agent_id={{AGENT_ID}}&api_key={{API_KEY}}"
            async with websockets.connect(uri, ping_interval=20, ping_timeout=20) as websocket:
                print(f"[{{datetime.now()}}] Connected to server")
                
                while True:
                    try:
                        message = await asyncio.wait_for(websocket.recv(), timeout=60)
                        data = json.loads(message)
                        
                        if data.get("type") == "ping_targets":
                            targets = data.get("targets", [])
                            print(f"[{{datetime.now()}}] Pinging {{len(targets)}} targets...")
                            
                            # Run all pings concurrently
                            async def do_ping(target):
                                ping_result = await ping_host(target["hostname"])
                                return {{"target": target, "result": ping_result}}
                            
                            results = await asyncio.gather(*[do_ping(t) for t in targets])
                            
                            # Send results sequentially (WebSocket not thread-safe)
                            for item in results:
                                target, ping_result = item["target"], item["result"]
                                await websocket.send(json.dumps({{
                                    "type": "ping_result",
                                    "target_id": target["id"],
                                    "target_hostname": target["hostname"],
                                    **ping_result
                                }}))
                            
                            print(f"[{{datetime.now()}}] Sent {{len(results)}} results")
                            
                            # MTR sequentially if needed
                            if data.get("include_mtr", False):
                                for target in targets:
                                    hops = await mtr_host(target["hostname"])
                                    await websocket.send(json.dumps({{
                                        "type": "mtr_result",
                                        "target_id": target["id"],
                                        "target_hostname": target["hostname"],
                                        "hops": hops
                                    }}))
                        
                        elif data.get("type") == "instant_ping":
                            request_id = data.get("request_id")
                            hostname = data.get("hostname")
                            ping_result = await ping_host(hostname)
                            await websocket.send(json.dumps({{
                                "type": "instant_ping_result",
                                "request_id": request_id,
                                "hostname": hostname,
                                **ping_result
                            }}))
                    except asyncio.TimeoutError:
                        await websocket.send(json.dumps({{"type": "heartbeat"}}))
                    except websockets.exceptions.ConnectionClosed:
                        print(f"[{{datetime.now()}}] Connection closed")
                        break
        except Exception as e:
            print(f"[{{datetime.now()}}] Error: {{e}}, reconnecting in 5s...")
            await asyncio.sleep(5)

if __name__ == "__main__":
    print("NetPing Agent Starting...")
    print(f"Agent ID: {{AGENT_ID}}")
    asyncio.run(run_agent())
'''
    return {"script": script, "agent_id": agent_id, "api_key": agent["api_key"]}

# One-liner install script (no auth required - uses agent's api_key for security)
@api_router.get("/agents/{agent_id}/install.sh")
async def get_agent_install_script(agent_id: str, api_key: str = Query(...)):
    """Get one-liner install script for agent"""
    agent = await db.agents.find_one({"id": agent_id, "api_key": api_key}, {"_id": 0})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found or invalid API key")
    
    backend_url = os.environ.get('BACKEND_WS_URL', 'wss://YOUR-DOMAIN.com')
    http_url = backend_url.replace('wss://', 'https://').replace('ws://', 'http://')
    
    install_script = f'''#!/bin/bash
# NetPing Agent Installer
# Agent: {agent["name"]}
# Auto-generated install script

set -e

echo "=========================================="
echo "  NetPing Agent Installer"
echo "  Agent: {agent["name"]}"
echo "=========================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (sudo)"
    exit 1
fi

echo "[1/5] Installing dependencies..."
apt-get update -qq
apt-get install -y -qq python3 python3-pip mtr-tiny > /dev/null 2>&1
pip3 install -q websockets --break-system-packages 2>/dev/null || pip3 install -q websockets

echo "[2/5] Creating agent script..."
cat > /opt/smokeping_agent.py << 'AGENT_EOF'
#!/usr/bin/env python3
"""
NetPing Agent
Agent ID: {agent_id}
Agent Name: {agent["name"]}
Auto-Update Enabled
"""
import asyncio
import websockets
import json
import subprocess
import re
import hashlib
import urllib.request
from datetime import datetime

AGENT_ID = "{agent_id}"
API_KEY = "{agent["api_key"]}"
WS_URL = "{backend_url}/api/ws/agent"
HTTP_URL = "{http_url}"
SCRIPT_PATH = "/opt/smokeping_agent.py"

def get_local_script_hash():
    try:
        with open(SCRIPT_PATH, "rb") as f:
            return hashlib.md5(f.read()).hexdigest()
    except:
        return None

def check_for_updates():
    try:
        url = f"{{HTTP_URL}}/api/agents/{{AGENT_ID}}/script-hash?api_key={{API_KEY}}"
        with urllib.request.urlopen(url, timeout=10) as resp:
            remote_hash = json.loads(resp.read().decode())["hash"]
        local_hash = get_local_script_hash()
        if local_hash and remote_hash and local_hash != remote_hash:
            print(f"[{{datetime.now()}}] Update available, downloading...")
            # Download new script
            script_url = f"{{HTTP_URL}}/api/agents/{{AGENT_ID}}/script?api_key={{API_KEY}}"
            with urllib.request.urlopen(script_url, timeout=30) as resp:
                new_script = json.loads(resp.read().decode())["script"]
            with open(SCRIPT_PATH, "w") as f:
                f.write(new_script)
            print(f"[{{datetime.now()}}] Update downloaded, restarting service...")
            subprocess.run(["systemctl", "restart", "smokeping-agent"], timeout=10)
    except Exception as e:
        print(f"[{{datetime.now()}}] Update check failed: {{e}}")

async def ping_host(hostname, count=2):
    try:
        cmd = ["ping", "-c", str(count), "-W", "2", hostname]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        output = result.stdout + result.stderr
        latency = None
        match = re.search(r"rtt min/avg/max/mdev = [\\d.]+/([\\d.]+)/", output)
        if match:
            latency = float(match.group(1))
        loss_match = re.search(r"(\\d+)% packet loss", output)
        packet_loss = float(loss_match.group(1)) if loss_match else 0.0
        status = "success" if latency is not None else "timeout"
        return {{"latency_ms": latency, "packet_loss": packet_loss, "status": status}}
    except subprocess.TimeoutExpired:
        return {{"latency_ms": None, "packet_loss": 100.0, "status": "timeout"}}
    except Exception as e:
        return {{"latency_ms": None, "packet_loss": 100.0, "status": "error"}}

async def mtr_host(hostname):
    try:
        cmd = ["mtr", "-r", "-c", "3", "-n", hostname]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        hops = []
        for line in result.stdout.split("\\n"):
            match = re.match(r"\\s*(\\d+)\\.\\|--\\s+([\\d.]+|\\?+)\\s+([\\d.]+)%\\s+\\d+\\s+([\\d.]+)?", line)
            if match:
                hops.append({{"hop": int(match.group(1)), "ip": match.group(2) if match.group(2) != "???" else None, "loss_percent": float(match.group(3)), "avg_ms": float(match.group(4)) if match.group(4) else None}})
        return hops
    except:
        return []

async def run_agent():
    last_update_check = 0
    while True:
        try:
            # Check for updates every 5 minutes
            now = datetime.now().timestamp()
            if now - last_update_check > 300:
                check_for_updates()
                last_update_check = now
            
            uri = f"{{WS_URL}}?agent_id={{AGENT_ID}}&api_key={{API_KEY}}"
            async with websockets.connect(uri, ping_interval=20, ping_timeout=20) as ws:
                print(f"[{{datetime.now()}}] Connected to server")
                while True:
                    try:
                        msg = await asyncio.wait_for(ws.recv(), timeout=60)
                        data = json.loads(msg)
                        if data.get("type") == "ping_targets":
                            targets = data.get("targets", [])
                            print(f"[{{datetime.now()}}] Pinging {{len(targets)}} targets...")
                            # Run all pings concurrently
                            async def do_ping(t):
                                r = await ping_host(t["hostname"])
                                return {{"target": t, "result": r}}
                            results = await asyncio.gather(*[do_ping(t) for t in targets])
                            # Send results sequentially (WebSocket is not thread-safe)
                            for item in results:
                                t, r = item["target"], item["result"]
                                await ws.send(json.dumps({{"type": "ping_result", "target_id": t["id"], "target_hostname": t["hostname"], **r}}))
                            print(f"[{{datetime.now()}}] Sent {{len(results)}} results")
                            # MTR sequentially if needed
                            if data.get("include_mtr"):
                                for t in targets:
                                    hops = await mtr_host(t["hostname"])
                                    await ws.send(json.dumps({{"type": "mtr_result", "target_id": t["id"], "target_hostname": t["hostname"], "hops": hops}}))
                        elif data.get("type") == "instant_ping":
                            r = await ping_host(data["hostname"])
                            await ws.send(json.dumps({{"type": "instant_ping_result", "request_id": data["request_id"], "hostname": data["hostname"], **r}}))
                        elif data.get("type") == "update_agent":
                            print(f"[{{datetime.now()}}] Server requested update")
                            check_for_updates()
                    except asyncio.TimeoutError:
                        # No message received, send heartbeat
                        await ws.send(json.dumps({{"type": "heartbeat"}}))
                    except websockets.exceptions.ConnectionClosed:
                        print(f"[{{datetime.now()}}] Connection closed")
                        break
        except Exception as e:
            print(f"[{{datetime.now()}}] Error: {{e}}, reconnecting in 5s...")
            await asyncio.sleep(5)

if __name__ == "__main__":
    print("NetPing Agent Starting...")
    asyncio.run(run_agent())
AGENT_EOF

chmod +x /opt/smokeping_agent.py

echo "[3/5] Creating systemd service..."
cat > /etc/systemd/system/smokeping-agent.service << 'SERVICE_EOF'
[Unit]
Description=NetPing Agent
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/python3 /opt/smokeping_agent.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SERVICE_EOF

echo "[4/5] Enabling and starting service..."
systemctl daemon-reload
systemctl enable smokeping-agent > /dev/null 2>&1
systemctl restart smokeping-agent

echo "[5/5] Verifying..."
sleep 2
if systemctl is-active --quiet smokeping-agent; then
    echo ""
    echo "=========================================="
    echo "  SUCCESS! Agent is running."
    echo "=========================================="
    echo ""
    echo "Commands:"
    echo "  Status:  systemctl status smokeping-agent"
    echo "  Logs:    journalctl -u smokeping-agent -f"
    echo "  Stop:    systemctl stop smokeping-agent"
    echo "  Restart: systemctl restart smokeping-agent"
    echo ""
else
    echo "ERROR: Agent failed to start"
    systemctl status smokeping-agent
    exit 1
fi
'''
    
    from fastapi.responses import PlainTextResponse
    return PlainTextResponse(content=install_script, media_type="text/plain")

# Agent script hash endpoint for auto-updates
@api_router.get("/agents/{agent_id}/script-hash")
async def get_agent_script_hash(agent_id: str, api_key: str = Query(...)):
    """Get hash of current agent script for update checking"""
    agent = await db.agents.find_one({"id": agent_id, "api_key": api_key}, {"_id": 0})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found or invalid API key")
    
    # Get the script content and compute hash
    script_data = await get_agent_script_content(agent_id, api_key)
    import hashlib
    script_hash = hashlib.md5(script_data["script"].encode()).hexdigest()
    return {"hash": script_hash}

# Agent script content endpoint for auto-updates
@api_router.get("/agents/{agent_id}/script")
async def get_agent_script_content(agent_id: str, api_key: str = Query(...)):
    """Get raw agent script content"""
    agent = await db.agents.find_one({"id": agent_id, "api_key": api_key}, {"_id": 0})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found or invalid API key")
    
    backend_url = os.environ.get('BACKEND_WS_URL', 'wss://YOUR-DOMAIN.com')
    http_url = backend_url.replace('wss://', 'https://').replace('ws://', 'http://')
    
    script = f'''#!/usr/bin/env python3
"""
NetPing Agent
Agent ID: {agent_id}
Agent Name: {agent["name"]}
Auto-Update Enabled
"""
import asyncio
import websockets
import json
import subprocess
import re
import hashlib
import urllib.request
from datetime import datetime

AGENT_ID = "{agent_id}"
API_KEY = "{agent["api_key"]}"
WS_URL = "{backend_url}/api/ws/agent"
HTTP_URL = "{http_url}"
SCRIPT_PATH = "/opt/smokeping_agent.py"

def get_local_script_hash():
    try:
        with open(SCRIPT_PATH, "rb") as f:
            return hashlib.md5(f.read()).hexdigest()
    except:
        return None

def check_for_updates():
    try:
        url = f"{{HTTP_URL}}/api/agents/{{AGENT_ID}}/script-hash?api_key={{API_KEY}}"
        with urllib.request.urlopen(url, timeout=10) as resp:
            remote_hash = json.loads(resp.read().decode())["hash"]
        local_hash = get_local_script_hash()
        if local_hash and remote_hash and local_hash != remote_hash:
            print(f"[{{datetime.now()}}] Update available, downloading...")
            script_url = f"{{HTTP_URL}}/api/agents/{{AGENT_ID}}/script?api_key={{API_KEY}}"
            with urllib.request.urlopen(script_url, timeout=30) as resp:
                new_script = json.loads(resp.read().decode())["script"]
            with open(SCRIPT_PATH, "w") as f:
                f.write(new_script)
            print(f"[{{datetime.now()}}] Update downloaded, restarting service...")
            subprocess.run(["systemctl", "restart", "smokeping-agent"], timeout=10)
    except Exception as e:
        print(f"[{{datetime.now()}}] Update check failed: {{e}}")

async def ping_host(hostname, count=2):
    try:
        cmd = ["ping", "-c", str(count), "-W", "2", hostname]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        output = result.stdout + result.stderr
        latency = None
        match = re.search(r"rtt min/avg/max/mdev = [\\d.]+/([\\d.]+)/", output)
        if match:
            latency = float(match.group(1))
        loss_match = re.search(r"(\\d+)% packet loss", output)
        packet_loss = float(loss_match.group(1)) if loss_match else 0.0
        status = "success" if latency is not None else "timeout"
        return {{"latency_ms": latency, "packet_loss": packet_loss, "status": status}}
    except subprocess.TimeoutExpired:
        return {{"latency_ms": None, "packet_loss": 100.0, "status": "timeout"}}
    except Exception as e:
        return {{"latency_ms": None, "packet_loss": 100.0, "status": "error"}}

async def mtr_host(hostname):
    try:
        cmd = ["mtr", "-r", "-c", "3", "-n", hostname]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        hops = []
        for line in result.stdout.split("\\n"):
            match = re.match(r"\\s*(\\d+)\\.\\|--\\s+([\\d.]+|\\?+)\\s+([\\d.]+)%\\s+\\d+\\s+([\\d.]+)?", line)
            if match:
                hops.append({{"hop": int(match.group(1)), "ip": match.group(2) if match.group(2) != "???" else None, "loss_percent": float(match.group(3)), "avg_ms": float(match.group(4)) if match.group(4) else None}})
        return hops
    except:
        return []

async def run_agent():
    last_update_check = 0
    while True:
        try:
            now = datetime.now().timestamp()
            if now - last_update_check > 300:
                check_for_updates()
                last_update_check = now
            
            uri = f"{{WS_URL}}?agent_id={{AGENT_ID}}&api_key={{API_KEY}}"
            async with websockets.connect(uri, ping_interval=20, ping_timeout=20) as ws:
                print(f"[{{datetime.now()}}] Connected to server")
                while True:
                    try:
                        msg = await asyncio.wait_for(ws.recv(), timeout=60)
                        data = json.loads(msg)
                        if data.get("type") == "ping_targets":
                            targets = data.get("targets", [])
                            print(f"[{{datetime.now()}}] Pinging {{len(targets)}} targets...")
                            async def do_ping(t):
                                r = await ping_host(t["hostname"])
                                return {{"target": t, "result": r}}
                            results = await asyncio.gather(*[do_ping(t) for t in targets])
                            for item in results:
                                t, r = item["target"], item["result"]
                                await ws.send(json.dumps({{"type": "ping_result", "target_id": t["id"], "target_hostname": t["hostname"], **r}}))
                            print(f"[{{datetime.now()}}] Sent {{len(results)}} results")
                            if data.get("include_mtr"):
                                for t in targets:
                                    hops = await mtr_host(t["hostname"])
                                    await ws.send(json.dumps({{"type": "mtr_result", "target_id": t["id"], "target_hostname": t["hostname"], "hops": hops}}))
                        elif data.get("type") == "instant_ping":
                            r = await ping_host(data["hostname"])
                            await ws.send(json.dumps({{"type": "instant_ping_result", "request_id": data["request_id"], "hostname": data["hostname"], **r}}))
                        elif data.get("type") == "update_agent":
                            print(f"[{{datetime.now()}}] Server requested update")
                            check_for_updates()
                    except asyncio.TimeoutError:
                        await ws.send(json.dumps({{"type": "heartbeat"}}))
                    except websockets.exceptions.ConnectionClosed:
                        print(f"[{{datetime.now()}}] Connection closed")
                        break
        except Exception as e:
            print(f"[{{datetime.now()}}] Error: {{e}}, reconnecting in 5s...")
            await asyncio.sleep(5)

if __name__ == "__main__":
    print("NetPing Agent Starting...")
    asyncio.run(run_agent())
'''
    return {"script": script}


# ============ Target Routes ============
@api_router.get("/targets", response_model=List[Dict])
async def get_targets(user: dict = Depends(get_current_user)):
    targets = await db.targets.find({}, {"_id": 0}).to_list(1000)
    return targets

@api_router.post("/targets")
async def create_target(target_data: TargetCreate, user: dict = Depends(get_current_user)):
    target = Target(
        hostname=target_data.hostname,
        name=target_data.name or target_data.hostname,
        threshold_ms=target_data.threshold_ms,
        enabled=target_data.enabled
    )
    await db.targets.insert_one(target.model_dump())
    return target.model_dump()

@api_router.put("/targets/{target_id}")
async def update_target(target_id: str, target_data: TargetCreate, user: dict = Depends(get_current_user)):
    result = await db.targets.update_one(
        {"id": target_id},
        {"$set": {
            "hostname": target_data.hostname,
            "name": target_data.name or target_data.hostname,
            "threshold_ms": target_data.threshold_ms,
            "enabled": target_data.enabled
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Target not found")
    return {"message": "Target updated"}

@api_router.delete("/targets/{target_id}")
async def delete_target(target_id: str, user: dict = Depends(get_current_user)):
    result = await db.targets.delete_one({"id": target_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Target not found")
    return {"message": "Target deleted"}

# ============ Results Routes ============
@api_router.get("/ping-results")
async def get_ping_results(
    agent_id: Optional[str] = None,
    target_id: Optional[str] = None,
    hours: int = 24,
    user: dict = Depends(get_current_user)
):
    query = {}
    if agent_id:
        query["agent_id"] = agent_id
    if target_id:
        query["target_id"] = target_id
    
    # Filter by time
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    query["timestamp"] = {"$gte": cutoff}
    
    results = await db.ping_results.find(query, {"_id": 0}).sort("timestamp", -1).to_list(10000)
    return results

@api_router.get("/mtr-results")
async def get_mtr_results(
    agent_id: Optional[str] = None,
    target_id: Optional[str] = None,
    limit: int = 100,
    user: dict = Depends(get_current_user)
):
    query = {}
    if agent_id:
        query["agent_id"] = agent_id
    if target_id:
        query["target_id"] = target_id
    
    results = await db.mtr_results.find(query, {"_id": 0}).sort("timestamp", -1).to_list(limit)
    return results

# ============ Alerts Routes ============
@api_router.get("/alerts", response_model=List[Dict])
async def get_alerts(
    resolved: Optional[bool] = None,
    limit: int = 100,
    user: dict = Depends(get_current_user)
):
    query = {}
    if resolved is not None:
        query["resolved"] = resolved
    
    alerts = await db.alerts.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return alerts

@api_router.put("/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: str, user: dict = Depends(get_current_user)):
    result = await db.alerts.update_one(
        {"id": alert_id},
        {"$set": {"resolved": True}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"message": "Alert resolved"}

# ============ Settings Routes ============
@api_router.get("/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    settings = await db.settings.find_one({"id": "global_settings"}, {"_id": 0})
    if not settings:
        default = Settings()
        await db.settings.insert_one(default.model_dump())
        return default.model_dump()
    return settings

@api_router.put("/settings")
async def update_settings(settings_data: Settings, user: dict = Depends(get_current_user)):
    settings_dict = settings_data.model_dump()
    settings_dict["id"] = "global_settings"
    await db.settings.update_one(
        {"id": "global_settings"},
        {"$set": settings_dict},
        upsert=True
    )
    return {"message": "Settings updated"}

# ============ Public Routes (No Auth) ============
@api_router.get("/public/status")
async def get_public_status():
    agents = await db.agents.find({}, {"_id": 0, "api_key": 0}).to_list(1000)
    # Hide hostname (IP) from public - only show name
    targets = await db.targets.find({"enabled": True}, {"_id": 0, "hostname": 0}).to_list(1000)
    
    # Get latest ping results for each agent-target combination (without hostname)
    results = []
    for agent in agents:
        for target in targets:
            latest = await db.ping_results.find_one(
                {"agent_id": agent["id"], "target_id": target["id"]},
                {"_id": 0, "target_hostname": 0},
                sort=[("timestamp", -1)]
            )
            if latest:
                results.append(latest)
    
    return {"agents": agents, "targets": targets, "latest_results": results}

@api_router.get("/public/ping-results")
async def get_public_ping_results(
    agent_id: Optional[str] = None,
    target_id: Optional[str] = None,
    hours: int = 24
):
    query = {}
    if agent_id:
        query["agent_id"] = agent_id
    if target_id:
        query["target_id"] = target_id
    
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    query["timestamp"] = {"$gte": cutoff}
    
    # Get results without exposing target_hostname (IP)
    results = await db.ping_results.find(query, {"_id": 0, "target_hostname": 0}).sort("timestamp", 1).to_list(10000)
    return results

@api_router.get("/public/alerts")
async def get_public_alerts(limit: int = 50):
    # Hide target_hostname from public alerts
    alerts = await db.alerts.find({"resolved": False}, {"_id": 0, "target_hostname": 0}).sort("created_at", -1).to_list(limit)
    return alerts

# ============ Instant Ping ============
class InstantPingRequest(BaseModel):
    hostname: str

class InstantPingResult(BaseModel):
    agent_id: str
    agent_name: str
    hostname: str
    latency_ms: Optional[float] = None
    packet_loss: float = 0.0
    status: str = "pending"
    timestamp: str = ""

# Store for instant ping results
instant_ping_results: Dict[str, Dict[str, InstantPingResult]] = {}

@api_router.post("/instant-ping")
async def instant_ping(request: InstantPingRequest, user: dict = Depends(get_current_user)):
    """Send instant ping request to all online agents"""
    hostname = request.hostname.strip()
    if not hostname:
        raise HTTPException(status_code=400, detail="Hostname is required")
    
    # Get all online agents
    agents = await db.agents.find({"status": "online"}, {"_id": 0}).to_list(100)
    
    if not agents:
        raise HTTPException(status_code=400, detail="No online agents available")
    
    # Create a unique request ID
    request_id = str(uuid.uuid4())
    instant_ping_results[request_id] = {}
    
    # Initialize results for all agents
    for agent in agents:
        instant_ping_results[request_id][agent["id"]] = InstantPingResult(
            agent_id=agent["id"],
            agent_name=agent["name"],
            hostname=hostname,
            status="pending"
        )
    
    # Send ping command to all online agents via WebSocket
    for agent in agents:
        if agent["id"] in manager.active_connections:
            try:
                await manager.send_to_agent(agent["id"], {
                    "type": "instant_ping",
                    "request_id": request_id,
                    "hostname": hostname
                })
            except Exception as e:
                instant_ping_results[request_id][agent["id"]].status = "error"
                logging.error(f"Failed to send instant ping to {agent['id']}: {e}")
    
    return {
        "request_id": request_id,
        "hostname": hostname,
        "agents_count": len(agents),
        "message": "Ping request sent to all online agents"
    }

@api_router.get("/instant-ping/{request_id}")
async def get_instant_ping_results(request_id: str, user: dict = Depends(get_current_user)):
    """Get results of an instant ping request"""
    if request_id not in instant_ping_results:
        raise HTTPException(status_code=404, detail="Request not found")
    
    results = list(instant_ping_results[request_id].values())
    
    # Check if all results are complete
    pending_count = sum(1 for r in results if r.status == "pending")
    completed = pending_count == 0
    
    # Clean up old requests (keep for 5 minutes)
    if completed:
        # Schedule cleanup after returning
        asyncio.create_task(cleanup_instant_ping(request_id))
    
    return {
        "request_id": request_id,
        "completed": completed,
        "pending_count": pending_count,
        "results": [r.model_dump() for r in results]
    }

async def cleanup_instant_ping(request_id: str):
    """Clean up instant ping results after 5 minutes"""
    await asyncio.sleep(300)
    if request_id in instant_ping_results:
        del instant_ping_results[request_id]

# ============ Dashboard Stats ============
@api_router.get("/dashboard/stats")
async def get_dashboard_stats(user: dict = Depends(get_current_user)):
    agents = await db.agents.find({}, {"_id": 0}).to_list(1000)
    targets = await db.targets.find({}, {"_id": 0}).to_list(1000)
    active_alerts = await db.alerts.count_documents({"resolved": False})
    
    online_agents = len([a for a in agents if a.get("status") == "online"])
    
    return {
        "total_agents": len(agents),
        "online_agents": online_agents,
        "total_targets": len(targets),
        "active_alerts": active_alerts
    }

# ============ WebSocket Routes ============
@api_router.websocket("/ws/agent")
async def websocket_agent(
    websocket: WebSocket,
    agent_id: str = Query(...),
    api_key: str = Query(...)
):
    # Verify agent
    agent = await db.agents.find_one({"id": agent_id, "api_key": api_key}, {"_id": 0})
    if not agent:
        await websocket.close(code=4001)
        return
    
    # Get client IP
    client_ip = websocket.client.host if websocket.client else None
    await db.agents.update_one(
        {"id": agent_id},
        {"$set": {"ip_address": client_ip}}
    )
    
    await manager.connect_agent(websocket, agent_id)
    
    # Store previous MTR results for route change detection
    previous_mtr: Dict[str, List] = {}
    
    try:
        # Get targets and settings
        targets = await db.targets.find({"enabled": True}, {"_id": 0}).to_list(1000)
        settings = await db.settings.find_one({"id": "global_settings"}, {"_id": 0})
        ping_interval = settings.get("ping_interval_seconds", 30) if settings else 30
        
        mtr_counter = 0
        
        while True:
            # Send ping targets to agent
            include_mtr = mtr_counter % 10 == 0  # MTR every 10 cycles (~5 min at 30s interval)
            await websocket.send_json({
                "type": "ping_targets",
                "targets": [{"id": t["id"], "hostname": t["hostname"]} for t in targets],
                "include_mtr": include_mtr
            })
            mtr_counter += 1
            
            # Wait for results
            try:
                while True:
                    message = await asyncio.wait_for(websocket.receive_text(), timeout=ping_interval)
                    data = json.loads(message)
                    
                    if data.get("type") == "heartbeat":
                        await db.agents.update_one(
                            {"id": agent_id},
                            {"$set": {"last_seen": datetime.now(timezone.utc).isoformat()}}
                        )
                        continue
                    
                    if data.get("type") == "ping_result":
                        # Save ping result
                        result = PingResult(
                            agent_id=agent_id,
                            target_id=data["target_id"],
                            target_hostname=data["target_hostname"],
                            latency_ms=data.get("latency_ms"),
                            packet_loss=data.get("packet_loss", 0),
                            status=data.get("status", "success")
                        )
                        await db.ping_results.insert_one(result.model_dump())
                        
                        # Broadcast to frontend
                        await manager.broadcast_to_frontend({
                            "type": "ping_result",
                            "data": result.model_dump()
                        })
                        
                        # Check threshold and create alert
                        target = next((t for t in targets if t["id"] == data["target_id"]), None)
                        if target and data.get("latency_ms"):
                            if data["latency_ms"] > target.get("threshold_ms", 100):
                                alert = Alert(
                                    alert_type="high_latency",
                                    message=f"High latency: {data['latency_ms']:.1f}ms (threshold: {target['threshold_ms']}ms)",
                                    agent_id=agent_id,
                                    agent_name=agent.get("name"),
                                    target_id=data["target_id"],
                                    target_hostname=data["target_hostname"],
                                    severity="warning"
                                )
                                await db.alerts.insert_one(alert.model_dump())
                                await send_alert_email(alert)
                                await manager.broadcast_to_frontend({
                                    "type": "alert",
                                    "data": alert.model_dump()
                                })
                        
                        # Check packet loss
                        if data.get("packet_loss", 0) > 0:
                            severity = "critical" if data["packet_loss"] >= 50 else "warning"
                            alert = Alert(
                                alert_type="packet_loss",
                                message=f"Packet loss: {data['packet_loss']:.1f}%",
                                agent_id=agent_id,
                                agent_name=agent.get("name"),
                                target_id=data["target_id"],
                                target_hostname=data["target_hostname"],
                                severity=severity
                            )
                            await db.alerts.insert_one(alert.model_dump())
                            await send_alert_email(alert)
                            await manager.broadcast_to_frontend({
                                "type": "alert",
                                "data": alert.model_dump()
                            })
                    
                    elif data.get("type") == "mtr_result":
                        # Save MTR result
                        result = MtrResult(
                            agent_id=agent_id,
                            target_id=data["target_id"],
                            target_hostname=data["target_hostname"],
                            hops=data.get("hops", [])
                        )
                        await db.mtr_results.insert_one(result.model_dump())
                        
                        # Check for route change
                        key = f"{agent_id}_{data['target_id']}"
                        current_hops = [h.get("ip") for h in data.get("hops", []) if h.get("ip")]
                        
                        if key in previous_mtr:
                            prev_hops = previous_mtr[key]
                            if current_hops != prev_hops:
                                alert = Alert(
                                    alert_type="route_change",
                                    message=f"Route changed: {' -> '.join(current_hops[:5])}...",
                                    agent_id=agent_id,
                                    agent_name=agent.get("name"),
                                    target_id=data["target_id"],
                                    target_hostname=data["target_hostname"],
                                    severity="info"
                                )
                                await db.alerts.insert_one(alert.model_dump())
                                await send_alert_email(alert)
                                await manager.broadcast_to_frontend({
                                    "type": "alert",
                                    "data": alert.model_dump()
                                })
                        
                        previous_mtr[key] = current_hops
                        
                        # Broadcast MTR result
                        await manager.broadcast_to_frontend({
                            "type": "mtr_result",
                            "data": result.model_dump()
                        })
                    
                    elif data.get("type") == "instant_ping_result":
                        # Handle instant ping result
                        request_id = data.get("request_id")
                        if request_id and request_id in instant_ping_results:
                            if agent_id in instant_ping_results[request_id]:
                                instant_ping_results[request_id][agent_id] = InstantPingResult(
                                    agent_id=agent_id,
                                    agent_name=agent.get("name", "Unknown"),
                                    hostname=data.get("hostname", ""),
                                    latency_ms=data.get("latency_ms"),
                                    packet_loss=data.get("packet_loss", 0),
                                    status=data.get("status", "success"),
                                    timestamp=datetime.now(timezone.utc).isoformat()
                                )
                        
            except asyncio.TimeoutError:
                # Refresh targets periodically
                targets = await db.targets.find({"enabled": True}, {"_id": 0}).to_list(1000)
                continue
                
    except WebSocketDisconnect:
        manager.disconnect_agent(agent_id)
        await db.agents.update_one(
            {"id": agent_id},
            {"$set": {"status": "offline", "last_seen": datetime.now(timezone.utc).isoformat()}}
        )
        # Create agent down alert
        alert = Alert(
            alert_type="agent_down",
            message=f"Agent disconnected: {agent.get('name')}",
            agent_id=agent_id,
            agent_name=agent.get("name"),
            severity="critical"
        )
        await db.alerts.insert_one(alert.model_dump())
        await send_alert_email(alert)
        await manager.broadcast_to_frontend({
            "type": "agent_status",
            "agent_id": agent_id,
            "status": "offline"
        })

@api_router.websocket("/ws/frontend")
async def websocket_frontend(websocket: WebSocket):
    await manager.connect_frontend(websocket)
    try:
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_frontend(websocket)

# Root endpoint
@api_router.get("/")
async def root():
    return {"message": "NetPing API", "version": "1.0.0"}

# Include router
app.include_router(api_router)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
