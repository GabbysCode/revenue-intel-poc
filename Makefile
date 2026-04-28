PYTHON := python3.11
VENV := backend/.venv
VENV_BIN := $(VENV)/bin

.PHONY: setup setup-backend setup-frontend seed dev backend frontend wheel \
        docker-up docker-down clean

setup: setup-backend setup-frontend seed

# Install the backend in editable mode against pyproject.toml so local edits
# show up without a rebuild — and so `make backend` runs the same console
# entry point that ships in the wheel.
setup-backend:
	$(PYTHON) -m venv $(VENV)
	$(VENV_BIN)/pip install --upgrade pip build
	$(VENV_BIN)/pip install -e backend

setup-frontend:
	cd frontend && npm install

seed:
	cd backend && $(abspath $(VENV_BIN))/python -c "from revintel_backend.db.connection import init_db; init_db()"

dev:
	@echo "Starting backend on :8000 and frontend on :3000..."
	@make backend & make frontend & wait

# Use the console_scripts entry point so dev mirrors prod exactly.
backend:
	cd backend && $(abspath $(VENV_BIN))/revintel-backend --reload --port 8000

frontend:
	cd frontend && npx next dev

# Build a distributable wheel for Databricks Apps deploys (and any other
# pip install target). Drops into backend/dist/revintel_backend-<ver>-py3-none-any.whl.
wheel:
	@echo "Building revintel-backend wheel..."
	$(VENV_BIN)/pip install --upgrade build >/dev/null
	rm -rf backend/dist backend/build backend/src/*.egg-info
	cd backend && $(abspath $(VENV_BIN))/python -m build --wheel --outdir dist
	@ls -la backend/dist/

docker-up:
	docker-compose up --build

docker-down:
	docker-compose down

clean:
	rm -rf backend/data/revintel.duckdb
	rm -rf backend/dist backend/build backend/src/*.egg-info
	rm -rf frontend/.next
	rm -rf frontend/node_modules
	rm -rf frontend/tsconfig.tsbuildinfo
	rm -rf $(VENV)
