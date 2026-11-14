#!/usr/bin/env python3
"""Wait for a verified TLS connection serving exactly the staged index.html."""
from http.client import HTTPSConnection
from pathlib import Path
import ssl
import sys
import time

expected = Path(sys.argv[1]).read_bytes()
deadline = time.monotonic() + 40
last_error = 'No response'
while time.monotonic() < deadline:
    connection = HTTPSConnection('primeboard.jacksonwalters.com', timeout=5,
                                 context=ssl.create_default_context())
    try:
        connection.request('GET', '/')
        response = connection.getresponse()
        body = response.read()
        if response.status == 200 and body == expected:
            print('Verified public HTTPS, hostname, certificate chain, and exact app content.')
            break
        last_error = f'HTTP {response.status}; content matches: {body == expected}'
    except (OSError, ssl.SSLError) as error:
        last_error = str(error)
    finally:
        connection.close()
    time.sleep(1)
else:
    raise SystemExit(f'HTTPS did not become ready: {last_error}')
