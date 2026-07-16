.PHONY: build run down logs shell

build:
	docker compose build

run:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f app

shell:
	docker compose exec app sh
