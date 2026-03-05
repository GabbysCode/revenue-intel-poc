PYTHON := python3.11
VENV := backend/.venv
VENV_BIN := $(VENV)/bin

.PHONY: setup dev backend frontend seed clean

setup: setup-backend setup-frontend seed

setup-backend:
	$(PYTHON) -m venv $(VENV)
	$(VENV_BIN)/pip install --upgrade pip
	$(VENV_BIN)/pip install -r backend/requirements.txt

setup-frontend:
	cd frontend && npm install

seed:
	cd backend && $(abspath $(VENV_BIN))/python -c "from db.connection import init_db; init_db()"

dev:
	@echo "Starting backend on :8000 and frontend on :3000..."
	@make backend & make frontend & wait

backend:
	cd backend && $(abspath $(VENV_BIN))/uvicorn main:app --reload --port 8000

frontend:
	cd frontend && npx next dev

docker-up:
	docker-compose up --build

docker-down:
	docker-compose down

clean:
	rm -rf backend/data/revintel.duckdb
	rm -rf frontend/.next
	rm -rf frontend/node_modules
	rm -rf $(VENV)
