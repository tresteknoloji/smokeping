#!/usr/bin/env python3
"""
SmokePing Network Monitoring System - Backend API Tests
Testing all major API endpoints and functionality
"""
import requests
import sys
import json
import time
from datetime import datetime

class SmokePingAPITester:
    def __init__(self, base_url="https://netping-debug.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.created_items = {
            'agents': [],
            'targets': []
        }

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'
        if headers:
            test_headers.update(headers)

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, timeout=10)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return True, response.json() if response.content else {}
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                if response.content:
                    try:
                        error_data = response.json()
                        print(f"   Error: {error_data}")
                    except:
                        print(f"   Response: {response.text[:200]}")
                return False, {}

        except requests.exceptions.Timeout:
            print(f"❌ Failed - Request timeout")
            return False, {}
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_root_endpoint(self):
        """Test API root endpoint"""
        success, response = self.run_test(
            "API Root",
            "GET",
            "",
            200
        )
        return success

    def test_register_user(self):
        """Test user registration"""
        test_user = f"testuser_{datetime.now().strftime('%H%M%S')}"
        success, response = self.run_test(
            "User Registration",
            "POST",
            "auth/register",
            200,
            data={"username": test_user, "password": "testpass123"}
        )
        if success and 'token' in response:
            self.token = response['token']
            print(f"   Registered user: {test_user}")
            return True
        return False

    def test_login_user(self):
        """Test user login with admin credentials"""
        success, response = self.run_test(
            "User Login (admin)",
            "POST",
            "auth/login",
            200,
            data={"username": "admin", "password": "admin123"}
        )
        if success and 'token' in response:
            self.token = response['token']
            print(f"   Logged in as admin")
            return True
        return False

    def test_get_me(self):
        """Test get current user info"""
        success, response = self.run_test(
            "Get Current User",
            "GET",
            "auth/me",
            200
        )
        return success

    def test_create_agent(self):
        """Test agent creation"""
        success, response = self.run_test(
            "Create Agent",
            "POST",
            "agents",
            200,
            data={"name": "Test Agent 1", "description": "Test monitoring agent"}
        )
        if success and 'id' in response:
            self.created_items['agents'].append(response['id'])
            print(f"   Created agent ID: {response['id']}")
            return True, response
        return False, {}

    def test_get_agents(self):
        """Test get all agents"""
        success, response = self.run_test(
            "Get Agents",
            "GET",
            "agents",
            200
        )
        return success, response

    def test_get_agent_script(self, agent_id):
        """Test get agent installation script"""
        success, response = self.run_test(
            "Get Agent Script",
            "GET",
            f"agents/{agent_id}/script",
            200
        )
        if success and 'script' in response:
            print(f"   Script length: {len(response['script'])} chars")
            return True
        return False

    def test_create_target(self):
        """Test target creation"""
        success, response = self.run_test(
            "Create Target",
            "POST",
            "targets",
            200,
            data={
                "hostname": "8.8.8.8",
                "name": "Google DNS",
                "threshold_ms": 50,
                "enabled": True
            }
        )
        if success and 'id' in response:
            self.created_items['targets'].append(response['id'])
            print(f"   Created target ID: {response['id']}")
            return True, response
        return False, {}

    def test_get_targets(self):
        """Test get all targets"""
        success, response = self.run_test(
            "Get Targets",
            "GET",
            "targets",
            200
        )
        return success, response

    def test_update_target(self, target_id):
        """Test target update"""
        success, response = self.run_test(
            "Update Target",
            "PUT",
            f"targets/{target_id}",
            200,
            data={
                "hostname": "1.1.1.1",
                "name": "Cloudflare DNS",
                "threshold_ms": 100,
                "enabled": True
            }
        )
        return success

    def test_get_alerts(self):
        """Test get alerts"""
        success, response = self.run_test(
            "Get Alerts",
            "GET",
            "alerts",
            200
        )
        return success, response

    def test_get_settings(self):
        """Test get settings"""
        success, response = self.run_test(
            "Get Settings",
            "GET",
            "settings",
            200
        )
        return success, response

    def test_update_settings(self):
        """Test update settings"""
        settings_data = {
            "default_threshold_ms": 120,
            "ping_interval_seconds": 45,
            "smtp": {
                "smtp_host": "smtp.test.com",
                "smtp_port": 587,
                "smtp_user": "test@test.com",
                "smtp_pass": "testpass",
                "smtp_from": "alerts@test.com",
                "alert_emails": ["admin@test.com"],
                "enabled": False
            }
        }
        success, response = self.run_test(
            "Update Settings",
            "PUT",
            "settings",
            200,
            data=settings_data
        )
        return success

    def test_dashboard_stats(self):
        """Test dashboard statistics"""
        success, response = self.run_test(
            "Dashboard Stats",
            "GET",
            "dashboard/stats",
            200
        )
        if success:
            print(f"   Stats: {response}")
        return success

    def test_ping_results(self):
        """Test get ping results"""
        success, response = self.run_test(
            "Get Ping Results",
            "GET",
            "ping-results?hours=24",
            200
        )
        return success, response

    def test_public_status(self):
        """Test public status endpoint (no auth required)"""
        success, response = self.run_test(
            "Public Status",
            "GET",
            "public/status",
            200
        )
        return success, response

    def test_public_ping_results(self):
        """Test public ping results (no auth required)"""
        success, response = self.run_test(
            "Public Ping Results",
            "GET",
            "public/ping-results?hours=1",
            200
        )
        return success

    def test_public_alerts(self):
        """Test public alerts (no auth required)"""
        success, response = self.run_test(
            "Public Alerts",
            "GET",
            "public/alerts?limit=10",
            200
        )
        return success

    def cleanup_created_items(self):
        """Clean up created test items"""
        print(f"\n🧹 Cleaning up created items...")
        
        # Delete created targets
        for target_id in self.created_items['targets']:
            success, _ = self.run_test(
                f"Delete Target {target_id}",
                "DELETE",
                f"targets/{target_id}",
                200
            )
        
        # Delete created agents
        for agent_id in self.created_items['agents']:
            success, _ = self.run_test(
                f"Delete Agent {agent_id}",
                "DELETE",
                f"agents/{agent_id}",
                200
            )

def main():
    """Main test execution"""
    print("🚀 Starting SmokePing API Tests")
    print(f"📡 Testing API: https://netping-debug.preview.emergentagent.com/api")
    
    tester = SmokePingAPITester()
    
    try:
        # Test API availability
        if not tester.test_root_endpoint():
            print("❌ API not accessible, stopping tests")
            return 1

        # Test authentication with existing admin user
        print(f"\n📝 Testing Authentication")
        if not tester.test_login_user():
            print("❌ Login failed, trying registration")
            if not tester.test_register_user():
                print("❌ Registration also failed, stopping tests")
                return 1
        
        if not tester.test_get_me():
            print("❌ Get user info failed")
            return 1

        # Test agent management
        print(f"\n🖥️  Testing Agent Management")
        agent_success, agent_data = tester.test_create_agent()
        if not agent_success:
            print("❌ Agent creation failed")
            return 1
        
        if not tester.test_get_agents()[0]:
            print("❌ Get agents failed")
            return 1
        
        if agent_data and 'id' in agent_data:
            if not tester.test_get_agent_script(agent_data['id']):
                print("❌ Get agent script failed")

        # Test target management
        print(f"\n🎯 Testing Target Management")
        target_success, target_data = tester.test_create_target()
        if not target_success:
            print("❌ Target creation failed")
            return 1
        
        if not tester.test_get_targets()[0]:
            print("❌ Get targets failed")
            return 1
        
        if target_data and 'id' in target_data:
            if not tester.test_update_target(target_data['id']):
                print("❌ Target update failed")

        # Test alerts and monitoring
        print(f"\n🚨 Testing Alerts & Monitoring")
        if not tester.test_get_alerts()[0]:
            print("❌ Get alerts failed")
        
        if not tester.test_ping_results()[0]:
            print("❌ Get ping results failed")

        # Test dashboard
        print(f"\n📊 Testing Dashboard")
        if not tester.test_dashboard_stats():
            print("❌ Dashboard stats failed")

        # Test settings
        print(f"\n⚙️  Testing Settings")
        if not tester.test_get_settings()[0]:
            print("❌ Get settings failed")
        
        if not tester.test_update_settings():
            print("❌ Update settings failed")

        # Test public endpoints (no auth)
        print(f"\n🌐 Testing Public Endpoints")
        if not tester.test_public_status()[0]:
            print("❌ Public status failed")
        
        if not tester.test_public_ping_results():
            print("❌ Public ping results failed")
        
        if not tester.test_public_alerts():
            print("❌ Public alerts failed")

        # Cleanup
        tester.cleanup_created_items()

        # Print results
        print(f"\n📊 Test Results Summary")
        print(f"   Tests Run: {tester.tests_run}")
        print(f"   Tests Passed: {tester.tests_passed}")
        print(f"   Success Rate: {(tester.tests_passed/tester.tests_run)*100:.1f}%")
        
        if tester.tests_passed == tester.tests_run:
            print(f"🎉 All tests passed!")
            return 0
        else:
            print(f"⚠️  {tester.tests_run - tester.tests_passed} tests failed")
            return 1

    except Exception as e:
        print(f"💥 Critical error during testing: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())