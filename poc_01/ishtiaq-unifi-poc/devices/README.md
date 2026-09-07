                     DeviceProfile
                          │
                          ▼
                  createRestDevice()
                          │
        ┌─────────────────┼─────────┐─────────────┐
        ▼             ▼             ▼             ▼
      Router        Switch        Camera      Door Access
      Port:4001    Port:4002    Port:4002  Port:4002

            Fig 1. Separate configuration from behavior.

## REST API: 
* GET /health
* GET /diagnostics
