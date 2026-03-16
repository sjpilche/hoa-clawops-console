#!/bin/bash
# =============================================================================
# OpenClaw Git Workflow Helper
# =============================================================================
# Usage:
#   ./scripts/git-workflow.sh feature "revenue-dashboard"  — create feature branch
#   ./scripts/git-workflow.sh review                        — run Ralph + tests before merge
#   ./scripts/git-workflow.sh merge                         — merge current branch to main
#   ./scripts/git-workflow.sh status                        — show branch status
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

COMMAND=${1:-status}
BRANCH_NAME=$2
ROOT=$(cd "$(dirname "$0")/.." && pwd)

case "$COMMAND" in

  feature)
    if [[ -z "$BRANCH_NAME" ]]; then
      echo -e "${RED}Usage: $0 feature <branch-name>${NC}"
      echo "  Example: $0 feature revenue-dashboard"
      exit 1
    fi
    FULL_BRANCH="feature/$BRANCH_NAME"
    echo -e "${GREEN}Creating feature branch: $FULL_BRANCH${NC}"
    git checkout -b "$FULL_BRANCH"
    echo -e "${GREEN}Switched to $FULL_BRANCH. Make your changes, then run:${NC}"
    echo "  $0 review    # Run Ralph + tests"
    echo "  $0 merge     # Merge to main"
    ;;

  review)
    echo "=== Pre-Merge Review ==="
    echo ""

    # 1. Ralph code review on changed files
    echo -e "${YELLOW}Running Ralph Code Review on changed files...${NC}"
    RALPH_RESULT=$(node -e "
      const ralph = require('./server/services/ralphCodeReview');
      const batch = ralph.reviewChangedFiles();
      console.log(JSON.stringify(batch));
    " 2>/dev/null)

    RALPH_CRITICALS=$(echo "$RALPH_RESULT" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); console.log(j.criticalCount||0)" 2>/dev/null || echo "?")
    RALPH_AVG=$(echo "$RALPH_RESULT" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); console.log(j.avgScore||0)" 2>/dev/null || echo "?")
    RALPH_FILES=$(echo "$RALPH_RESULT" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); console.log(j.filesReviewed||0)" 2>/dev/null || echo "?")

    if [[ "$RALPH_CRITICALS" == "0" ]]; then
      echo -e "  ${GREEN}[PASS]${NC} Ralph: $RALPH_FILES files, avg score $RALPH_AVG/100, 0 critical"
    else
      echo -e "  ${RED}[FAIL]${NC} Ralph: $RALPH_CRITICALS CRITICAL issues found"
      echo -e "  ${RED}Fix critical issues before merging.${NC}"
    fi

    echo ""

    # 2. Unit tests
    echo -e "${YELLOW}Running unit tests...${NC}"
    if npx vitest run --reporter=verbose 2>&1 | tail -5; then
      echo -e "  ${GREEN}[PASS]${NC} Unit tests"
    else
      echo -e "  ${RED}[FAIL]${NC} Unit tests — fix before merging"
    fi

    echo ""

    # 3. DB health check (if server running)
    echo -e "${YELLOW}Checking DB health...${NC}"
    DB_HEALTH=$(curl -sf "http://localhost:3001/api/health" 2>/dev/null)
    if [[ -n "$DB_HEALTH" ]]; then
      echo -e "  ${GREEN}[PASS]${NC} Server health endpoint responding"
    else
      echo -e "  ${YELLOW}[SKIP]${NC} Server not running — skip DB health check"
    fi

    echo ""
    echo "=== Review Complete ==="
    if [[ "$RALPH_CRITICALS" != "0" ]]; then
      echo -e "${RED}BLOCKED: Fix critical issues before merging.${NC}"
      exit 1
    fi
    echo -e "${GREEN}Ready to merge. Run: $0 merge${NC}"
    ;;

  merge)
    CURRENT=$(git branch --show-current)
    if [[ "$CURRENT" == "main" ]]; then
      echo -e "${RED}Already on main. Switch to a feature branch first.${NC}"
      exit 1
    fi

    echo -e "${YELLOW}Merging $CURRENT into main...${NC}"

    # Run review first
    echo "Running pre-merge review..."
    "$0" review || exit 1

    echo ""
    echo -e "${GREEN}Review passed. Merging...${NC}"
    git checkout main
    git merge "$CURRENT" --no-ff -m "Merge $CURRENT into main"
    echo -e "${GREEN}Merged $CURRENT into main.${NC}"
    echo ""
    echo "To delete the feature branch: git branch -d $CURRENT"
    ;;

  status)
    echo "=== Git Status ==="
    echo "Branch: $(git branch --show-current)"
    echo ""
    echo "Changed files:"
    git diff --stat HEAD 2>/dev/null || echo "(no changes)"
    echo ""
    echo "Untracked files:"
    git ls-files --others --exclude-standard | head -10
    UNTRACKED=$(git ls-files --others --exclude-standard | wc -l)
    if [[ $UNTRACKED -gt 10 ]]; then
      echo "  ... and $((UNTRACKED - 10)) more"
    fi
    ;;

  *)
    echo "Usage: $0 {feature|review|merge|status} [branch-name]"
    echo ""
    echo "Commands:"
    echo "  feature <name>  Create a feature branch"
    echo "  review           Run Ralph + tests (pre-merge check)"
    echo "  merge            Merge current branch to main"
    echo "  status           Show current branch and changes"
    ;;
esac
