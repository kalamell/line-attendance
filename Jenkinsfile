pipeline {
  agent any

  environment {
    DEPLOY_HOST = 'root@167.99.66.6'
    APP_DIR     = '/opt/poszee-attendance'
  }

  stages {
    stage('Install') {
      steps {
        sh 'corepack enable'
        sh 'pnpm install --no-frozen-lockfile'
      }
    }
    stage('Typecheck') {
      steps {
        sh 'pnpm -r typecheck'
      }
    }
    stage('Build web') {
      steps {
        sh 'pnpm --filter @poszee/liff build'
        sh 'pnpm --filter @poszee/console build'
      }
    }
    stage('Deploy') {
      // deploys on push to main
      when { branch 'main' }
      steps {
        // sync repo + built SPAs to the droplet, then bring up the stack + run migrations
        sh '''
          rsync -az --delete --exclude node_modules ./ ${DEPLOY_HOST}:${APP_DIR}/
          ssh ${DEPLOY_HOST} "cd ${APP_DIR} && docker compose up -d --build && docker compose run --rm api pnpm db:migrate"
        '''
      }
    }
  }

  post {
    success { echo 'Deployed to hr.poszee.com' }
    failure { echo 'Build failed' }
  }
}
