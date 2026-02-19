export default function PhoneMockup() {
  return (
    <div className="phone">
      <div className="phone__body">
        <div className="phone__screen">
          <div className="phone__island" />

          <div className="phone__head">
            <span className="phone__name">MileClear</span>
            <span className="phone__active">Shift Active</span>
          </div>

          <div className="phone__miles-block">
            <div className="phone__miles-num">47.3</div>
            <div className="phone__miles-unit">miles today</div>
          </div>

          <div className="phone__hr" />

          <div className="phone__stats">
            <div className="phone__stat">
              <div className="phone__stat-val">&pound;21.29</div>
              <div className="phone__stat-lbl">Tax saved</div>
            </div>
            <div className="phone__stat">
              <div className="phone__stat-val phone__stat-val--green">12 days</div>
              <div className="phone__stat-lbl">Streak</div>
            </div>
          </div>

          <div className="phone__route">
            <div className="phone__route-dots">
              <div className="phone__route-dot phone__route-dot--start" />
              <div className="phone__route-line" />
              <div className="phone__route-dot phone__route-dot--end" />
            </div>
            <div className="phone__route-text">
              <div className="phone__route-addr">Tesco Depot, Manchester</div>
              <div className="phone__route-addr">14 Elm Road, Salford</div>
            </div>
          </div>

          <div className="phone__end-btn">End Shift</div>
          <div className="phone__home" />
        </div>
      </div>
    </div>
  );
}
