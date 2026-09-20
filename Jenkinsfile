// Runs on the droplet's own Jenkins (agent = the host). On push to main it syncs
// the checkout into /opt/poszee-attendance (keeping .env + docker volumes), then
// rebuilds and redeploys the app containers. Does NOT touch the shared nginx.
// Uses `cd "$APP_DIR"` inside sh (not the dir() step) so Jenkins doesn't try to
// create /opt/poszee-attendance@tmp (jenkins can't write /opt).
pipeline {
  agent any

  environment {
    APP_DIR = '/opt/poszee-attendance'
    COMPOSE = 'docker-compose -f docker-compose.prod.yml'
  }

  options {
    disableConcurrentBuilds()
    timeout(time: 20, unit: 'MINUTES')
  }

  stages {
    stage('Sync to app dir') {
      steps {
        sh 'rsync -a --delete --exclude .env --exclude node_modules --exclude .git --exclude "packages/*/dist" ./ "$APP_DIR"/'
      }
    }
    stage('Build') {
      steps { sh 'cd "$APP_DIR" && $COMPOSE build poszee-api poszee-web' }
    }
    stage('Migrate') {
      steps { sh 'cd "$APP_DIR" && $COMPOSE run --rm poszee-api pnpm db:migrate' }
    }
    stage('Deploy') {
      steps { sh 'cd "$APP_DIR" && $COMPOSE up -d poszee-api poszee-web' }
    }
    stage('Smoke test') {
      steps {
        sh 'cd "$APP_DIR" && sleep 5 && $COMPOSE exec -T poszee-api node -e "fetch(\'http://localhost:3000/api/health\').then(r=>r.text()).then(t=>{console.log(t)}).catch(e=>{console.error(e);process.exit(1)})"'
      }
    }
  }

  post {
    success { echo '✓ Deployed to https://hr.poszee.com' }
    failure { echo '✗ Deploy failed' }
  }
}
